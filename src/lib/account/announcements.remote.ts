import { z } from "zod";
import { announcementsFor, markAnnouncementRead } from "#lib/server/account/announcements.ts";
import { learner } from "#lib/server/guard.ts";
import { command, query } from "$app/server";

/* What Libiamo tells every learner, above the greeting: the announcements showing now, each read or not. */
export const announcements = query(async () => announcementsFor(learner().id));

export const readAnnouncement = command(z.number().int(), async (id) => {
	await markAnnouncementRead(learner().id, id);
	await announcements().refresh();
});
