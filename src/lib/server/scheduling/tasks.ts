import { and, asc, notInArray as drizzleNotInArray, eq, max, ne, sql } from "drizzle-orm";
import type { LanguageCode } from "$lib/constants";
import { db } from "$lib/server/db";
import { task, template, templateVariant } from "$lib/server/db/schema";
import { dayjs, getMondayFromWeekString, getMondayOfWeekForDate, toDateString } from "./dates";

export { getMondayFromWeekString, getMondayOfWeekForDate, toDateString } from "./dates";

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

async function insertTask(tpl: typeof template.$inferSelect, dateStr: string, origin: "manual" | "auto") {
	if (!tpl.urgency) {
		throw new Error(`Cannot schedule template ${tpl.id}: non-translation templates require urgency`);
	}

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

	// Compose agent prompt (MBTI is applied at session start, not task creation)
	const agentPrompt = tpl.agentPromptBase ? resolveSlots(tpl.agentPromptBase, slots) : null;

	await db
		.insert(task)
		.values({
			templateId: tpl.id,
			variantId: variant.id,
			language: tpl.language,
			cadence: tpl.cadence,
			date: dateStr,
			origin,
			urgency: tpl.urgency,
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

	const conditions = [
		eq(template.language, language),
		eq(template.cadence, cadence),
		eq(template.isActive, true),
		ne(template.interactionType, "translate"),
	];

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

	const [weeklyCount] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(task)
		.where(and(eq(task.language, language), eq(task.date, mondayStr), eq(task.cadence, "weekly")));

	const [dailyCount] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(task)
		.where(and(eq(task.language, language), eq(task.date, todayStr), eq(task.cadence, "daily")));

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
	} else if (!dayjs(dateStr, "YYYY-MM-DD", true).isValid()) {
		throw new Error("Invalid date string. Must be a valid YYYY-MM-DD date.");
	}

	await insertTask(tpl, targetDateStr, "manual");
}
