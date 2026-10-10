import { fail } from "@sveltejs/kit";
import { z } from "zod";
import { announcementSchema } from "$lib/schemas";
import { createAnnouncement, deleteAnnouncement, listAnnouncements } from "$lib/server/announcement";
import { requireAdmin } from "$lib/server/auth/authz";
import { dayjs } from "$lib/server/task/lineup-dates";
import { getBrowserTimezone } from "$lib/time/browser-timezone";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
	requireAdmin(event);
	return { announcements: await listAnnouncements(), timeZone: getBrowserTimezone(event.cookies) };
};

export const actions: Actions = {
	publish: async (event) => {
		const admin = requireAdmin(event);
		const formData = await event.request.formData();
		const raw = {
			title: formData.get("title")?.toString() ?? "",
			body: formData.get("body")?.toString() ?? "",
			expiresAt: formData.get("expiresAt")?.toString() ?? "",
		};
		const result = announcementSchema.safeParse(raw);
		if (!result.success) return fail(400, { action: "publish", errors: z.flattenError(result.error).fieldErrors, values: raw });

		const expiresAt = result.data.expiresAt ? dayjs.tz(result.data.expiresAt, getBrowserTimezone(event.cookies)).toDate() : null;
		if (expiresAt && expiresAt <= new Date()) {
			return fail(400, { action: "publish", errors: { expiresAt: ["Choose a time in the future"] }, values: raw });
		}
		await createAnnouncement({ title: result.data.title, body: result.data.body, expiresAt, createdBy: admin.id });
		return { action: "publish", success: true };
	},
	delete: async (event) => {
		requireAdmin(event);
		const id = Number((await event.request.formData()).get("id"));
		if (!Number.isSafeInteger(id) || id < 1) return fail(400, { action: "delete", message: "Invalid announcement" });
		await deleteAnnouncement(id);
		return { action: "delete", success: true };
	},
};
