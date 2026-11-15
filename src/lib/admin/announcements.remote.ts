import { z } from "zod";
import { adminAnnouncements, deleteAnnouncement, saveAnnouncement } from "#lib/server/account/announcements.ts";
import { admin } from "#lib/server/guard.ts";
import { command, query } from "$app/server";

/* The admin's announcements. */
export const announcementList = query(async () => {
	admin();
	return adminAnnouncements();
});

const Local = z.record(z.string().max(10), z.string().max(4000));
export const saveOneAnnouncement = command(
	z.object({
		id: z.number().int().nullable(),
		title: Local,
		body: Local,
		until: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]),
		publish: z.boolean(),
	}),
	async (input) => {
		const u = admin();
		const id = await saveAnnouncement(input, u.id);
		await announcementList().refresh();
		return id;
	},
);

export const deleteOneAnnouncement = command(z.number().int(), async (id) => {
	admin();
	await deleteAnnouncement(id);
	await announcementList().refresh();
});
