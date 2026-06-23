import { fail } from "@sveltejs/kit";
import { USER_KEYWORDS_MAX_LENGTH, USER_TEXT_MAX_LENGTH } from "$lib/constants";
import { listCompletedSessions } from "$lib/server/archive";
import { requireUser } from "$lib/server/auth/authz";
import { followUpOnFeedback } from "$lib/server/feedback";
import { TrialQuotaExhaustedError, trialQuotaExhaustedData, withPendingQuotaNotice } from "$lib/server/llm";
import { deleteNote, getNote, updateNote } from "$lib/server/note";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
	const user = requireUser({ locals });

	const groups = await listCompletedSessions(user.id);
	return { groups };
};

export const actions: Actions = {
	update: async ({ request, locals }) => {
		const user = requireUser({ locals });

		const formData = await request.formData();
		const noteId = Number.parseInt(formData.get("noteId") as string, 10);
		const tutorComment = (formData.get("tutorComment") as string)?.trim();
		const keywordsRaw = (formData.get("keywords") as string)?.trim();

		if (Number.isNaN(noteId)) return fail(400, { error: "Invalid note ID" });
		if (!tutorComment) return fail(400, { error: "Content is required" });
		if (tutorComment.length > USER_TEXT_MAX_LENGTH) return fail(400, { error: "Content is too long" });
		if (keywordsRaw && keywordsRaw.length > USER_KEYWORDS_MAX_LENGTH) return fail(400, { error: "Keywords are too long" });

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

		return { success: true, note: updated };
	},

	delete: async ({ request, locals }) => {
		const user = requireUser({ locals });

		const formData = await request.formData();
		const noteId = Number.parseInt(formData.get("noteId") as string, 10);

		if (Number.isNaN(noteId)) return fail(400, { error: "Invalid note ID" });

		const deleted = await deleteNote(noteId, user.id);
		if (!deleted) return fail(404, { error: "Note not found" });

		return { success: true, noteId: deleted.id };
	},

	followUp: async ({ request, locals }) => {
		const user = requireUser({ locals });

		const formData = await request.formData();
		const noteId = Number.parseInt(formData.get("noteId") as string, 10);
		const question = (formData.get("question") as string)?.trim();

		if (Number.isNaN(noteId)) return fail(400, { error: "Invalid note ID" });
		if (!question) return fail(400, { error: "Question is required" });
		if (question.length > USER_TEXT_MAX_LENGTH) return fail(400, { error: "Question is too long" });

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
			return withPendingQuotaNotice(user.id, { success: true, answer: result.answer });
		} catch (e) {
			if (e instanceof TrialQuotaExhaustedError) {
				return fail(402, trialQuotaExhaustedData(e));
			}
			console.error(e);
			return fail(500, { error: "Failed to get follow-up answer" });
		}
	},
};
