import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "$lib/server/db";
import { task, template } from "$lib/server/db/schema";

export function getMondayOfWeek(d: Date): Date {
	const date = new Date(d);
	const day = date.getDay();
	const diff = day === 0 ? -6 : 1 - day;
	date.setDate(date.getDate() + diff);
	date.setHours(0, 0, 0, 0);
	return date;
}

export function toDateString(d: Date): string {

	const year = d.getFullYear();
	const month = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

function resolveSlots(text: string, slots: Record<string, string>): string {
	return text.replace(/\{\{(\w+)\}\}/g, (_, k) => slots[k] ?? `{{${k}}}`);
}

function resolveObjectives(
	objectives: { order: number; text: string }[] | null,
	slots: Record<string, string>,
): { order: number; text: string }[] | null {
	if (!objectives) return null;
	return objectives.map((o) => ({ ...o, text: resolveSlots(o.text, slots) }));
}

async function insertTask(tpl: typeof template.$inferSelect, dateStr: string, origin: "manual" | "auto") {
	const candidates = tpl.candidates as { slots: Record<string, string>; context?: Record<string, unknown> }[];
	if (!candidates || candidates.length === 0) return;

	const candidate = candidates[Math.floor(Math.random() * candidates.length)];
	const slots = candidate.slots;

	await db
		.insert(task)
		.values({
			templateId: tpl.id,
			language: tpl.language,
			date: dateStr,
			origin,
			titleResolved: resolveSlots(tpl.titleBase, slots),
			shortObjectiveResolved: tpl.shortObjectiveBase ? resolveSlots(tpl.shortObjectiveBase, slots) : null,
			descriptionResolved: tpl.descriptionBase ? resolveSlots(tpl.descriptionBase, slots) : null,
			objectivesResolved: resolveObjectives(tpl.objectivesBase as { order: number; text: string }[] | null, slots),
			agentPromptResolved: tpl.agentPromptBase ? resolveSlots(tpl.agentPromptBase, slots) : null,
			contextResolved: candidate.context ?? null,
		})
		.onConflictDoNothing({
			target: [task.date, task.templateId],
		});

	await db
		.update(template)
		.set({ lastScheduledAt: new Date(dateStr) })
		.where(eq(template.id, tpl.id));
}

export async function ensureTasksForDate(language: "en" | "es" | "fr" | "ja", today: Date): Promise<void> {
	const monday = getMondayOfWeek(today);
	const mondayStr = toDateString(monday);

	const [weeklyCount] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(task)
		.where(and(eq(task.language, language), eq(task.date, mondayStr)));

	const weeklyNeeded = Math.max(0, 3 - (weeklyCount?.count ?? 0));

	if (weeklyNeeded > 0) {
		const templates = await db
			.select()
			.from(template)
			.where(and(eq(template.language, language), eq(template.duration, "weekly"), eq(template.isActive, true)))
			.orderBy(asc(template.lastScheduledAt))
			.limit(weeklyNeeded);

		for (const tpl of templates) {
			try {
				await insertTask(tpl, mondayStr, "auto");
			} catch (e) {
				console.error(`Failed to schedule weekly task for template ${tpl.id} on ${mondayStr}:`, e);
			}
		}
	}
}

export async function scheduleTaskManually(templateId: number, dateStr: string): Promise<void> {
	const [tpl] = await db.select().from(template).where(eq(template.id, templateId)).limit(1);
	if (!tpl) throw new Error("Template not found");

	let finalDateStr = dateStr;

	if (tpl.duration === "weekly") {
		const [y, m, d] = dateStr.split("-").map(Number);

		const localDate = new Date(y, m - 1, d, 12, 0, 0);
		finalDateStr = toDateString(getMondayOfWeek(localDate));
	}

	await insertTask(tpl, finalDateStr, "manual");
}