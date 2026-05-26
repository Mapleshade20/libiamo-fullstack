import { error, fail } from "@sveltejs/kit";
import { listCompletedSessions } from "$lib/server/archive";
import { deleteNote, getNote, updateNote } from "$lib/server/note";
import { followUpOnFeedback } from "$lib/server/session";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
	const user = locals.user;
	if (!user) throw error(401, "Unauthorized");

	const groups = await listCompletedSessions(user.id);
	return { groups, language: user.activeLanguage };
};

export const actions: Actions = {
	update: async ({ request, locals }) => {
		const user = locals.user;
		if (!user) return fail(401);

		const formData = await request.formData();
		const noteId = Number.parseInt(formData.get("noteId") as string, 10);
		const tutorComment = (formData.get("tutorComment") as string)?.trim();
		const keywordsRaw = (formData.get("keywords") as string)?.trim();

		if (Number.isNaN(noteId)) return fail(400, { error: "Invalid note ID" });
		if (!tutorComment) return fail(400, { error: "Content is required" });

		const updated = await updateNote(noteId, user.id, {
			tutorComment,
			keywords: keywordsRaw
				? keywordsRaw
						.split(",")
						.map((k) => k.trim())
						.filter(Boolean)
				: [],
		});
		if (!updated) return fail(404, { error: "Note not found" });

		return { success: true };
	},

	delete: async ({ request, locals }) => {
		const user = locals.user;
		if (!user) return fail(401);

		const formData = await request.formData();
		const noteId = Number.parseInt(formData.get("noteId") as string, 10);

		if (Number.isNaN(noteId)) return fail(400, { error: "Invalid note ID" });

		const deleted = await deleteNote(noteId, user.id);
		if (!deleted) return fail(404, { error: "Note not found" });

		return { success: true };
	},

	followUp: async ({ request, locals }) => {
		const user = locals.user;
		if (!user) return fail(401, { error: "Unauthorized" });

		const formData = await request.formData();
		const noteId = Number.parseInt(formData.get("noteId") as string, 10);
		const question = (formData.get("question") as string)?.trim();

		if (Number.isNaN(noteId)) return fail(400, { error: "Invalid note ID" });
		if (!question) return fail(400, { error: "Question is required" });

		const note = await getNote(noteId, user.id);
		if (!note) return fail(404, { error: "Note not found" });

		try {
			const result = await followUpOnFeedback({
				sessionId: note.sourceSessionId,
				userId: user.id,
				itemText: note.tutorComment,
				category: "grammar",
				question,
			});
			return { success: true, answer: result.answer };
		} catch (e) {
			console.error(e);
			return fail(500, { error: "Failed to get follow-up answer" });
		}
	},
};
