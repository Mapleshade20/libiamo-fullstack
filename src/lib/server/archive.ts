import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "./db";
import { note, practiceSession, translationAttempt } from "./db/schema";

type ArchiveNote = {
	id: number;
	vocab: string;
	targetDefinition: string;
	nativeDefinition: string;
};

export type ArchiveActivity = {
	id: number;
	activityKey: string;
	type: "practice" | "translation";
	title: string;
	ui: string;
	href: string;
	completedAt: Date;
	notes: ArchiveNote[];
};

function getTimeGroup(date: Date, now: Date): string {
	const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const startOfYesterday = new Date(startOfToday.getTime() - 86_400_000);
	const startOfWeek = new Date(startOfToday);
	startOfWeek.setDate(startOfToday.getDate() - (startOfToday.getDay() || 7) + 1);
	if (date >= startOfToday) return "Today";
	if (date >= startOfYesterday) return "Yesterday";
	if (date >= startOfWeek) return "This Week";
	return "Earlier";
}

export interface ArchiveGroup {
	label: string;
	activities: ArchiveActivity[];
}

export async function listCompletedActivities(userId: string, now = new Date()): Promise<ArchiveGroup[]> {
	const [sessions, translations] = await Promise.all([
		db.query.practiceSession.findMany({
			where: and(eq(practiceSession.userId, userId), inArray(practiceSession.status, ["completed", "evaluated"])),
			columns: { id: true, taskId: true, completedAt: true },
			with: {
				task: { columns: { title: true }, with: { template: { columns: { ui: true } } } },
				notes: { orderBy: desc(note.id), columns: { id: true, vocab: true, targetDefinition: true, nativeDefinition: true } },
			},
			orderBy: desc(practiceSession.completedAt),
		}),
		db.query.translationAttempt.findMany({
			where: and(eq(translationAttempt.userId, userId), eq(translationAttempt.workflowPhase, "completed")),
			columns: { id: true, completedAt: true },
			with: {
				sourceSet: { columns: { templateId: true }, with: { template: { columns: { titleBase: true } } } },
				notes: { orderBy: desc(note.id), columns: { id: true, vocab: true, targetDefinition: true, nativeDefinition: true } },
			},
			orderBy: desc(translationAttempt.completedAt),
		}),
	]);

	const activities: ArchiveActivity[] = [];
	for (const session of sessions) {
		if (!session.completedAt) continue;
		activities.push({
			id: session.id,
			activityKey: `practice:${session.id}`,
			type: "practice",
			title: session.task.title,
			ui: session.task.template.ui,
			href: `/task/${session.taskId}/feedback`,
			completedAt: session.completedAt,
			notes: session.notes,
		});
	}
	for (const attempt of translations) {
		if (!attempt.completedAt) continue;
		activities.push({
			id: attempt.id,
			activityKey: `translation:${attempt.id}`,
			type: "translation",
			title: attempt.sourceSet.template.titleBase,
			ui: "translator",
			href: `/translate/${attempt.sourceSet.templateId}`,
			completedAt: attempt.completedAt,
			notes: attempt.notes,
		});
	}
	activities.sort((left, right) => right.completedAt.getTime() - left.completedAt.getTime());

	const groups = new Map<string, ArchiveActivity[]>();
	for (const activity of activities) {
		const label = getTimeGroup(activity.completedAt, now);
		groups.set(label, [...(groups.get(label) ?? []), activity]);
	}
	return ["Today", "Yesterday", "This Week", "Earlier"].flatMap((label) => {
		const grouped = groups.get(label);
		return grouped?.length ? [{ label, activities: grouped }] : [];
	});
}
