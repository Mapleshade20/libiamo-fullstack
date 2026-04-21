import { and, asc, notInArray as drizzleNotInArray, eq, max, sql } from "drizzle-orm";
import type { LanguageCode } from "$lib/constants";
import { getMondayFromWeekString, getMondayOfWeek, getMondayOfWeekForDate, toDateString } from "$lib/server/dates";
import { db } from "$lib/server/db";
import { task, template, templateVariant } from "$lib/server/db/schema";

export { getMondayFromWeekString, getMondayOfWeek, getMondayOfWeekForDate, toDateString };

function resolveSlots(text: string, slots: Record<string, string>): string {
	return text.replaceAll(/\{\{(\w+)\}\}/g, (_, k) => {
		// Safely check for own properties to prevent prototype leakage (e.g., __proto__)
		if (Object.hasOwn(slots, k) && slots[k] !== undefined) {
			return slots[k];
		}
		return `{{${k}}}`;
	});
}

function resolveObjectives(objectives: string[] | null | undefined, slots: Record<string, string>): string[] | null {
	if (!objectives || objectives.length === 0) return null;
	return objectives.map((o) => resolveSlots(o, slots));
}

const MBTI_TYPES = [
	"INTJ",
	"INTP",
	"ENTJ",
	"ENTP",
	"INFJ",
	"INFP",
	"ENFJ",
	"ENFP",
	"ISTJ",
	"ISFJ",
	"ESTJ",
	"ESFJ",
	"ISTP",
	"ISFP",
	"ESTP",
	"ESFP",
] as const;

type MbtiType = (typeof MBTI_TYPES)[number];

const MBTI_PROMPT_MAP: Record<MbtiType, string> = {
	INTJ: "You are an INTJ personality type: strategic, analytical, and direct. You value efficiency and tend to be reserved but decisive.",
	INTP: "You are an INTP personality type: logical, curious, and reflective. You enjoy exploring ideas and may be slow to commit.",
	ENTJ: "You are an ENTJ personality type: confident, assertive, and goal-oriented. You take charge and communicate with authority.",
	ENTP: "You are an ENTP personality type: inventive, energetic, and argumentative. You enjoy debate and thinking outside the box.",
	INFJ: "You are an INFJ personality type: empathetic, insightful, and principled. You care deeply about others and act with intention.",
	INFP: "You are an INFP personality type: idealistic, compassionate, and introspective. You express yourself with warmth and creativity.",
	ENFJ: "You are an ENFJ personality type: charismatic, empathetic, and encouraging. You naturally bring out the best in others.",
	ENFP: "You are an ENFP personality type: enthusiastic, spontaneous, and imaginative. You are warm and love connecting with people.",
	ISTJ: "You are an ISTJ personality type: responsible, thorough, and detail-oriented. You follow through on commitments reliably.",
	ISFJ: "You are an ISFJ personality type: caring, dependable, and observant. You prioritize harmony and support those around you.",
	ESTJ: "You are an ESTJ personality type: organized, decisive, and practical. You value order and clear expectations.",
	ESFJ: "You are an ESFJ personality type: sociable, warm, and conscientious. You thrive when helping and pleasing others.",
	ISTP: "You are an ISTP personality type: calm, observant, and pragmatic. You act on facts and enjoy working with your hands.",
	ISFP: "You are an ISFP personality type: gentle, flexible, and artistic. You are attuned to aesthetics and live in the moment.",
	ESTP: "You are an ESTP personality type: energetic, perceptive, and bold. You are action-oriented and enjoy fast-paced situations.",
	ESFP: "You are an ESFP personality type: spontaneous, playful, and enthusiastic. You love life and are naturally entertaining.",
};

function randomMbtiPersonaPrefix(): string {
	const type = MBTI_TYPES[Math.floor(Math.random() * MBTI_TYPES.length)];
	return MBTI_PROMPT_MAP[type];
}

async function insertTask(tpl: typeof template.$inferSelect, dateStr: string, origin: "manual" | "auto") {
	// Query active variants for this template
	const variants = await db
		.select()
		.from(templateVariant)
		.where(and(eq(templateVariant.templateId, tpl.id), eq(templateVariant.isActive, true)));

	if (!variants || variants.length === 0) {
		throw new Error(`Cannot schedule task for template ${tpl.id} on ${dateStr}: no active variants available`);
	}

	// Select a random variant
	const variant = variants[Math.floor(Math.random() * variants.length)];
	const slots = (variant.slotValues ?? {}) as Record<string, string>;

	// Compose agent prompt with MBTI persona prefix
	const basePrompt = tpl.agentPromptBase ? resolveSlots(tpl.agentPromptBase, slots) : null;
	const agentPrompt = basePrompt ? `${randomMbtiPersonaPrefix()}\n\n${basePrompt}` : null;

	await db
		.insert(task)
		.values({
			templateId: tpl.id,
			variantId: variant.id,
			language: tpl.language,
			date: dateStr,
			origin,
			title: resolveSlots(tpl.titleBase, slots),
			shortObjective: tpl.shortObjectiveBase ? resolveSlots(tpl.shortObjectiveBase, slots) : null,
			description: tpl.descriptionBase ? resolveSlots(tpl.descriptionBase, slots) : null,
			objectives: resolveObjectives(tpl.objectivesBase, slots),
			agentPrompt,
		})
		.onConflictDoNothing({
			target: [task.date, task.templateId],
		});
}

async function scheduleAutoTasks(language: LanguageCode, cadence: "daily" | "weekly", targetDateStr: string, neededCount: number) {
	if (neededCount <= 0) return;

	// Fetch IDs of templates already scheduled for this date to avoid useless DB retry
	const scheduledTasks = await db
		.select({ templateId: task.templateId })
		.from(task)
		.where(and(eq(task.date, targetDateStr), eq(task.language, language)));
	const scheduledIds = scheduledTasks.map((t) => t.templateId);

	const conditions = [eq(template.language, language), eq(template.cadence, cadence), eq(template.isActive, true)];

	if (scheduledIds.length > 0) {
		// Use Drizzle's native notInArray directly instead of the brittle custom wrapper
		conditions.push(drizzleNotInArray(template.id, scheduledIds));
	}

	const templates = await db
		.select({ tpl: template })
		.from(template)
		.leftJoin(task, eq(task.templateId, template.id))
		.where(and(...conditions))
		.groupBy(template.id)
		.orderBy(asc(max(task.date)).append(sql` nulls first`))
		.limit(neededCount);

	for (const { tpl } of templates) {
		try {
			await insertTask(tpl, targetDateStr, "auto");
		} catch (e) {
			console.error(`Failed to schedule ${cadence} task for template ${tpl.id} on ${targetDateStr}:`, e);
		}
	}
}

export async function ensureTasksForDate(language: LanguageCode, todayStr: string): Promise<void> {
	const mondayStr = getMondayOfWeekForDate(todayStr);

	// Join template table to filter counts by specific cadence to avoid confusing daily/weekly quotas on Mondays
	const [weeklyCount] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(task)
		.innerJoin(template, eq(task.templateId, template.id))
		.where(and(eq(task.language, language), eq(task.date, mondayStr), eq(template.cadence, "weekly")));

	const [dailyCount] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(task)
		.innerJoin(template, eq(task.templateId, template.id))
		.where(and(eq(task.language, language), eq(task.date, todayStr), eq(template.cadence, "daily")));

	const weeklyNeeded = Math.max(0, 3 - (weeklyCount?.count ?? 0));
	const dailyNeeded = Math.max(0, 3 - (dailyCount?.count ?? 0));

	await scheduleAutoTasks(language, "weekly", mondayStr, weeklyNeeded);
	await scheduleAutoTasks(language, "daily", todayStr, dailyNeeded);
}

export async function scheduleTaskManually(templateId: number, dateStr: string): Promise<void> {
	const [tpl] = await db.select().from(template).where(eq(template.id, templateId)).limit(1);
	if (!tpl) throw new Error("Template not found");

	let targetDateStr = dateStr;

	// Automatically snap to Monday if parsing a week string.
	// For weekly templates, require an ISO week string (YYYY-Www).
	if (dateStr.includes("-W")) {
		const monday = getMondayFromWeekString(dateStr);
		targetDateStr = toDateString(monday);
	} else if (tpl.cadence === "weekly") {
		throw new Error("Weekly templates require an ISO week date string (e.g. 2026-W16)");
	}

	await insertTask(tpl, targetDateStr, "manual");
}
