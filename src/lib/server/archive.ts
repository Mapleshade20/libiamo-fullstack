import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "./db";
import { note, practiceSession } from "./db/schema";

export type SessionWithNotes = {
	id: number;
	taskId: number;
	taskTitle: string;
	ui: string;
	completedAt: Date;
	notes: {
		id: number;
		tutorComment: string;
		keywords: string[] | null;
		sourceContext: string | null;
	}[];
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
	sessions: SessionWithNotes[];
}

export async function listCompletedSessions(userId: string, now: Date = new Date()): Promise<ArchiveGroup[]> {
	const sessions = await db.query.practiceSession.findMany({
		where: and(eq(practiceSession.userId, userId), inArray(practiceSession.status, ["completed", "evaluated"])),
		with: {
			task: {
				columns: { title: true },
				with: { template: { columns: { ui: true } } },
			},
			notes: {
				orderBy: desc(note.id),
				columns: {
					id: true,
					tutorComment: true,
					keywords: true,
					sourceContext: true,
				},
			},
		},
		orderBy: desc(practiceSession.completedAt),
	});

	const withNotes = sessions.filter((s) => s.notes.length > 0 && s.completedAt != null);

	const groups = new Map<string, SessionWithNotes[]>();
	for (const s of withNotes) {
		if (!s.completedAt) continue;
		const completedAt = s.completedAt;
		const group = getTimeGroup(completedAt, now);
		if (!groups.has(group)) groups.set(group, []);
		groups.get(group)?.push({
			id: s.id,
			taskId: s.taskId,
			taskTitle: s.task?.title ?? "Unknown Task",
			ui: s.task?.template?.ui ?? "unknown",
			completedAt,
			notes: s.notes,
		});
	}

	const order = ["Today", "Yesterday", "This Week", "Earlier"];
	const result: ArchiveGroup[] = [];
	for (const label of order) {
		const sessions = groups.get(label);
		if (sessions && sessions.length > 0) result.push({ label, sessions });
	}
	return result;
}
