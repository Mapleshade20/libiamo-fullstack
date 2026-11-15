import { and, count, desc, eq, gt, isNotNull, isNull, lte, or } from "drizzle-orm";
import { db } from "#lib/server/db/index.ts";
import { announcement, announcementRead } from "#lib/server/db/schema.ts";

/*
 * Announcements: written per interface language, shown above the greeting from when they are published until the day
 * set (the end of that day, UTC), acknowledged one by one. The admin's list counts who has read each.
 */
export type Announcement = { id: number; date: string; title: Record<string, string>; body: Record<string, string>; read: boolean };

const showing = (now: Date) =>
	and(isNotNull(announcement.publishedAt), lte(announcement.publishedAt, now), or(isNull(announcement.expiresAt), gt(announcement.expiresAt, now)));

export async function announcementsFor(userId: string, now = new Date()): Promise<Announcement[]> {
	const rows = await db
		.select({ a: announcement, readAt: announcementRead.readAt })
		.from(announcement)
		.leftJoin(announcementRead, and(eq(announcementRead.announcementId, announcement.id), eq(announcementRead.userId, userId)))
		.where(showing(now))
		.orderBy(desc(announcement.publishedAt));
	return rows.map(({ a, readAt }) => ({
		id: a.id,
		date: (a.publishedAt as Date).toISOString(),
		title: a.title as Record<string, string>,
		body: a.body as Record<string, string>,
		read: !!readAt,
	}));
}

export async function markAnnouncementRead(userId: string, announcementId: number) {
	await db.insert(announcementRead).values({ userId, announcementId }).onConflictDoNothing();
}

export type AdminAnnouncement = {
	id: number;
	publishedAt: string | null;
	/** The last day it is shown (YYYY-MM-DD), or "" for no end. */
	until: string;
	title: Record<string, string>;
	body: Record<string, string>;
	read: number;
};

export async function adminAnnouncements(): Promise<AdminAnnouncement[]> {
	const [rows, reads] = await Promise.all([
		db.select().from(announcement).orderBy(desc(announcement.createdAt)),
		db.select({ id: announcementRead.announcementId, n: count() }).from(announcementRead).groupBy(announcementRead.announcementId),
	]);
	const n = new Map(reads.map((r) => [r.id, r.n]));
	return rows.map((a) => ({
		id: a.id,
		publishedAt: a.publishedAt?.toISOString() ?? null,
		until: a.expiresAt ? new Date(a.expiresAt.getTime() - 1).toISOString().slice(0, 10) : "",
		title: a.title as Record<string, string>,
		body: a.body as Record<string, string>,
		read: n.get(a.id) ?? 0,
	}));
}

/** Saves an announcement; `publish` shows it from now (a published one stays published). Answers its id. */
export async function saveAnnouncement(
	input: { id: number | null; title: Record<string, string>; body: Record<string, string>; until: string; publish: boolean },
	by: string,
) {
	// Shown through the whole of its last day.
	const expiresAt = input.until ? new Date(Date.parse(`${input.until}T00:00:00Z`) + 86_400_000) : null;
	const set = { title: input.title, body: input.body, expiresAt };
	if (input.id === null) {
		const [row] = await db
			.insert(announcement)
			.values({ ...set, createdBy: by, publishedAt: input.publish ? new Date() : null })
			.returning({ id: announcement.id });
		return row.id;
	}
	const [was] = await db.select({ publishedAt: announcement.publishedAt }).from(announcement).where(eq(announcement.id, input.id));
	await db
		.update(announcement)
		.set({ ...set, ...(input.publish && !was?.publishedAt ? { publishedAt: new Date() } : {}) })
		.where(eq(announcement.id, input.id));
	return input.id;
}

export async function deleteAnnouncement(id: number) {
	await db.delete(announcement).where(eq(announcement.id, id));
}
