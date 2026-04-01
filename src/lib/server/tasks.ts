import { db } from '$lib/server/db';
import { template, task } from '$lib/server/db/schema';
import { eq, and, sql, asc } from 'drizzle-orm';

export function getMondayOfWeek(d: Date): Date {
	const date = new Date(d);
	const day = date.getDay();
	const diff = day === 0 ? -6 : 1 - day;
	date.setDate(date.getDate() + diff);
	date.setHours(0, 0, 0, 0);
	return date;
}

export function toDateString(d: Date): string {
	return d.toISOString().slice(0, 10);
}

function resolveSlots(text: string, slots: Record<string, string>): string {
	return text.replace(/\{\{(\w+)\}\}/g, (_, k) => slots[k] ?? `{{${k}}}`);
}

function resolveObjectives(
	objectives: { order: number; text: string }[] | null,
	slots: Record<string, string>
): { order: number; text: string }[] | null {
	if (!objectives) return null;
	return objectives.map((o) => ({ ...o, text: resolveSlots(o.text, slots) }));
}

async function insertTask(
	tpl: typeof template.$inferSelect,
	dateStr: string,
	origin: 'manual' | 'auto'
) {
	const candidates = tpl.candidates as { slots: Record<string, string>; context?: Record<string, unknown> }[];
	if (!candidates || candidates.length === 0) return;

	const candidate = candidates[Math.floor(Math.random() * candidates.length)];
	const slots = candidate.slots;

	try {
		await db.insert(task).values({
			templateId: tpl.id,
			language: tpl.language,
			date: dateStr,
			origin,
			titleResolved: resolveSlots(tpl.titleBase, slots),
			descriptionResolved: tpl.descriptionBase ? resolveSlots(tpl.descriptionBase, slots) : null,
			objectivesResolved: resolveObjectives(
				tpl.objectivesBase as { order: number; text: string }[] | null,
				slots
			),
			agentPromptResolved: tpl.agentPromptBase ? resolveSlots(tpl.agentPromptBase, slots) : null,
			contextResolved: candidate.context ?? null
		});

		await db
			.update(template)
			.set({ lastScheduledAt: new Date() })
			.where(eq(template.id, tpl.id));
	} catch (err: unknown) {
		// Unique constraint violation (date + templateId) — treat as no-op
		if (typeof err === 'object' && err !== null && 'code' in err && err.code === '23505') return;
		throw err;
	}
}

export async function ensureTasksForDate(
	language: 'en' | 'es' | 'fr' | 'ja',
	today: Date
): Promise<void> {
	const monday = getMondayOfWeek(today);
	const mondayStr = toDateString(monday);
	const todayStr = toDateString(today);

	// Count existing tasks
	const [weeklyCount] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(task)
		.where(and(eq(task.language, language), eq(task.date, mondayStr)));

	const [dailyCount] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(task)
		.where(and(eq(task.language, language), eq(task.date, todayStr)));

	const weeklyNeeded = Math.max(0, 3 - (weeklyCount?.count ?? 0));
	const dailyNeeded = Math.max(0, 3 - (dailyCount?.count ?? 0));

	if (weeklyNeeded > 0) {
		const templates = await db
			.select()
			.from(template)
			.where(
				and(
					eq(template.language, language),
					eq(template.duration, 'weekly'),
					eq(template.isActive, true)
				)
			)
			.orderBy(asc(template.lastScheduledAt))
			.limit(weeklyNeeded);

		for (const tpl of templates) {
			await insertTask(tpl, mondayStr, 'auto');
		}
	}

	if (dailyNeeded > 0) {
		const templates = await db
			.select()
			.from(template)
			.where(
				and(
					eq(template.language, language),
					eq(template.duration, 'daily'),
					eq(template.isActive, true)
				)
			)
			.orderBy(asc(template.lastScheduledAt))
			.limit(dailyNeeded);

		for (const tpl of templates) {
			await insertTask(tpl, todayStr, 'auto');
		}
	}
}

export async function scheduleTaskManually(
	templateId: number,
	dateStr: string
): Promise<void> {
	const [tpl] = await db.select().from(template).where(eq(template.id, templateId)).limit(1);
	if (!tpl) throw new Error('Template not found');
	await insertTask(tpl, dateStr, 'manual');
}
