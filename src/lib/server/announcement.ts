/**
 * Admin notices. A learner sees every live announcement (not expired, not deleted) in the Hall:
 * unread ones in the inbox, acknowledged ones in the collection beside the greeting.
 */

import { and, count, desc, eq, gt, isNull, or } from "drizzle-orm";
import { db } from "$lib/server/db";
import { announcement, announcementRead } from "$lib/server/db/schema";

export interface HallAnnouncement {
	id: number;
	title: string;
	/** Markdown. */
	body: string;
	publishedAt: Date;
	read: boolean;
}

function isLive(now: Date) {
	return or(isNull(announcement.expiresAt), gt(announcement.expiresAt, now));
}

/** A learner's live announcements, newest first. */
export async function listHallAnnouncements(userId: string, now = new Date()): Promise<HallAnnouncement[]> {
	const rows = await db
		.select({
			id: announcement.id,
			title: announcement.title,
			body: announcement.body,
			publishedAt: announcement.createdAt,
			readAt: announcementRead.readAt,
		})
		.from(announcement)
		.leftJoin(announcementRead, and(eq(announcementRead.announcementId, announcement.id), eq(announcementRead.userId, userId)))
		.where(isLive(now))
		.orderBy(desc(announcement.createdAt), desc(announcement.id));
	return rows.map(({ readAt, ...row }) => ({ ...row, read: readAt !== null }));
}

/** Records an acknowledgement. Repeating it is harmless; returns false when the announcement is gone. */
export async function markAnnouncementRead(userId: string, announcementId: number, now = new Date()): Promise<boolean> {
	const [live] = await db
		.select({ id: announcement.id })
		.from(announcement)
		.where(and(eq(announcement.id, announcementId), isLive(now)))
		.limit(1);
	if (!live) return false;
	await db.insert(announcementRead).values({ userId, announcementId }).onConflictDoNothing();
	return true;
}

/** Every announcement, expired ones included, with how many learners have acknowledged it. */
export async function listAnnouncements() {
	return db
		.select({
			id: announcement.id,
			title: announcement.title,
			body: announcement.body,
			expiresAt: announcement.expiresAt,
			createdAt: announcement.createdAt,
			readCount: count(announcementRead.userId),
		})
		.from(announcement)
		.leftJoin(announcementRead, eq(announcementRead.announcementId, announcement.id))
		.groupBy(announcement.id)
		.orderBy(desc(announcement.createdAt), desc(announcement.id));
}

export async function createAnnouncement(input: { title: string; body: string; expiresAt: Date | null; createdBy: string }): Promise<void> {
	await db.insert(announcement).values(input);
}

export async function deleteAnnouncement(id: number): Promise<void> {
	await db.delete(announcement).where(eq(announcement.id, id));
}
