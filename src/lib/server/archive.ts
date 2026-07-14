import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "./db";
import { note, practiceSession, reviewCard, translationAttempt } from "./db/schema";

type ArchiveNote = {
	id: number;
	tutorComment: string;
	keywords: string[] | null;
	sourceContext: string | null;
	hasReviewCard: boolean;
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

function getTimeGroup(date: Date, now: Date = new Date()): string {
	const d = new Date(date);
	const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const startOfYesterday = new Date(startOfToday.getTime() - 86400000);
	const startOfWeek = new Date(startOfToday);
	startOfWeek.setDate(startOfToday.getDate() - (startOfToday.getDay() || 7) + 1);
	if (d >= startOfToday) return "Today";
	if (d >= startOfYesterday) return "Yesterday";
	if (d >= startOfWeek) return "This Week";
	return "Earlier";
}

export interface ArchiveGroup {
	label: string;
	activities: ArchiveActivity[];
}

export async function listCompletedActivities(userId: string, now: Date = new Date()): Promise<ArchiveGroup[]> {
	const [sessions, translations] = await Promise.all([
		db.query.practiceSession.findMany({
			where: and(eq(practiceSession.userId, userId), inArray(practiceSession.status, ["completed", "evaluated"])),
			columns: { id: true, taskId: true, completedAt: true },
			with: {
				task: {
					columns: { title: true },
					with: { template: { columns: { ui: true } } },
				},
				notes: {
					orderBy: desc(note.id),
					columns: { id: true, tutorComment: true, keywords: true, sourceContext: true },
				},
			},
			orderBy: desc(practiceSession.completedAt),
		}),
		db.query.translationAttempt.findMany({
			where: and(eq(translationAttempt.userId, userId), eq(translationAttempt.status, "evaluated")),
			columns: { id: true, evaluatedAt: true },
			with: {
				sourceSet: {
					columns: { templateId: true },
					with: { template: { columns: { titleBase: true } } },
				},
				notes: {
					orderBy: desc(note.id),
					columns: { id: true, tutorComment: true, keywords: true, sourceContext: true },
				},
			},
			orderBy: desc(translationAttempt.evaluatedAt),
		}),
	]);

	const noteIds = [
		...sessions.flatMap((session) => session.notes.map((item) => item.id)),
		...translations.flatMap((attempt) => attempt.notes.map((item) => item.id)),
	];
	const noteIdsWithCards = new Set<number>();
	if (noteIds.length > 0) {
		const cards = await db.query.reviewCard.findMany({
			where: inArray(reviewCard.sourceNoteId, noteIds),
			columns: { sourceNoteId: true },
		});
		for (const card of cards) if (card.sourceNoteId !== null) noteIdsWithCards.add(card.sourceNoteId);
	}

	const withCardState = (items: Array<Omit<ArchiveNote, "hasReviewCard">>): ArchiveNote[] =>
		items.map((item) => ({ ...item, hasReviewCard: noteIdsWithCards.has(item.id) }));
	const activities: ArchiveActivity[] = [];
	for (const session of sessions) {
		if (!session.completedAt) continue;
		activities.push({
			id: session.id,
			activityKey: `practice:${session.id}`,
			type: "practice",
			title: session.task?.title ?? "Unknown Task",
			ui: session.task?.template?.ui ?? "unknown",
			href: `/task/${session.taskId}/feedback`,
			completedAt: session.completedAt,
			notes: withCardState(session.notes),
		});
	}
	for (const attempt of translations) {
		if (!attempt.evaluatedAt) continue;
		activities.push({
			id: attempt.id,
			activityKey: `translation:${attempt.id}`,
			type: "translation",
			title: attempt.sourceSet?.template?.titleBase ?? "Translation",
			ui: "translator",
			href: `/translate/${attempt.sourceSet?.templateId}`,
			completedAt: attempt.evaluatedAt,
			notes: withCardState(attempt.notes),
		});
	}
	activities.sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime());

	const groups = new Map<string, ArchiveActivity[]>();
	for (const activity of activities) {
		const label = getTimeGroup(activity.completedAt, now);
		const group = groups.get(label) ?? [];
		group.push(activity);
		groups.set(label, group);
	}
	return ["Today", "Yesterday", "This Week", "Earlier"].flatMap((label) => {
		const groupedActivities = groups.get(label);
		return groupedActivities?.length ? [{ label, activities: groupedActivities }] : [];
	});
}
