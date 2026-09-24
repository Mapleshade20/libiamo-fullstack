import { error, fail, redirect } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import { base } from "$app/paths";
import { parseTaskForm, parseTaskJson } from "$lib/admin/task-actions";
import { deleteUnusedTask, getTaskRotation, updateTask } from "$lib/server/admin/tasks";
import { requireAdmin } from "$lib/server/auth/authz";
import { db } from "$lib/server/db";
import { task } from "$lib/server/db/schema";
import type { Actions, PageServerLoad } from "./$types";

function parseId(value: string) {
	const id = Number(value);
	return Number.isSafeInteger(id) && id > 0 ? id : null;
}

async function requireTaskId(event: { params: { id: string } }) {
	const id = parseId(event.params.id);
	if (!id) throw error(404, "Task not found");
	return id;
}

export const load: PageServerLoad = async (event) => {
	requireAdmin(event);
	const id = await requireTaskId(event);

	const [found] = await db.select().from(task).where(eq(task.id, id)).limit(1);
	if (!found) throw error(404, "Task not found");

	return { task: found, rotation: await getTaskRotation(id) };
};

export const actions: Actions = {
	save: async (event) => {
		requireAdmin(event);
		const id = await requireTaskId(event);

		const parsed = parseTaskForm(await event.request.formData());
		if (!parsed.success) return fail(400, { action: "save", errors: parsed.errors, values: parsed.values });

		await updateTask(id, parsed.task, { rotation: parsed.rotation });
		return { saved: true };
	},

	setActive: async (event) => {
		requireAdmin(event);
		const id = await requireTaskId(event);

		const isActive = (await event.request.formData()).get("isActive") === "true";
		const [updated] = await db.update(task).set({ isActive }).where(eq(task.id, id)).returning({ id: task.id });
		if (!updated) return fail(404, { action: "setActive", message: "Task not found" });
		return isActive ? { activated: true } : { deactivated: true };
	},

	delete: async (event) => {
		requireAdmin(event);
		const id = await requireTaskId(event);

		const result = await deleteUnusedTask(id);
		if (!result.deleted) return fail(400, { action: "delete", message: result.message });
		return redirect(302, `${base}/admin/tasks`);
	},

	importJson: async (event) => {
		requireAdmin(event);
		const id = await requireTaskId(event);

		const rawJson = (await event.request.formData()).get("taskJson");
		if (typeof rawJson !== "string" || rawJson.trim() === "")
			return fail(400, { action: "importJson", message: "Paste task JSON before importing." });

		const result = parseTaskJson(rawJson);
		if (!result.success) return fail(400, { action: "importJson", message: result.error });

		await updateTask(id, result.data.task, { rotation: result.data.rotation, isActive: result.data.isActive });
		return { imported: true };
	},
};
