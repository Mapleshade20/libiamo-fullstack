import { error } from "@sveltejs/kit";
import { z } from "zod";
import { announcementsFor, forgetAnnouncementReads, markAnnouncementRead } from "#lib/server/account/announcements.ts";
import { learner } from "#lib/server/guard.ts";
import { dev } from "$app/env";
import { command, query } from "$app/server";

/* What Libiamo tells every learner, above the greeting: the announcements showing now, each read or not. */
export const announcements = query(async () => announcementsFor(learner().id));

export const readAnnouncement = command(z.number().int(), async (id) => {
	await markAnnouncementRead(learner().id, id);
	await announcements().refresh();
});

/** Developer settings: every announcement unread again (development and admins only). */
export const unreadAnnouncements = command(async () => {
	const u = learner();
	if (!dev && u.role !== "admin") error(404, "Not found");
	await forgetAnnouncementReads(u.id);
	await announcements().refresh();
});
