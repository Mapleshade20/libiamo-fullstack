import { fail } from "@sveltejs/kit";
import { USER_TEXT_MAX_LENGTH } from "$lib/constants";
import { listCompletedActivities } from "$lib/server/archive";
import { requireUser } from "$lib/server/auth/authz";
import { followUpOnFeedback, followUpOnLearningContent } from "$lib/server/feedback";
import { llmErrorMessage, llmErrorStatus } from "$lib/server/llm";
import { deleteNote, getNote, updateNote } from "$lib/server/note";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
	const user = requireUser({ locals });

	const groups = await listCompletedActivities(user.id);
	return { groups };
};

export const actions: Actions = {
	update: async ({ request, locals }) => {
		const user = requireUser({ locals });

		const formData = await request.formData();
		const noteId = Number.parseInt(formData.get("noteId") as string, 10);
		const vocab = (formData.get("vocab") as string)?.trim();
		const targetDefinition = (formData.get("targetDefinition") as string)?.trim();
		const nativeDefinition = (formData.get("nativeDefinition") as string)?.trim();

		if (Number.isNaN(noteId)) return fail(400, { error: "Invalid note ID" });
		if (!vocab || !targetDefinition || !nativeDefinition) return fail(400, { error: "Vocabulary and both definitions are required" });
		if ([vocab, targetDefinition, nativeDefinition].some((value) => value.length > USER_TEXT_MAX_LENGTH)) {
			return fail(400, { error: "Content is too long" });
		}

		const updated = await updateNote(noteId, user.id, { vocab, targetDefinition, nativeDefinition });
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
			const result = note.sourceSessionId
				? await followUpOnFeedback({
						sessionId: note.sourceSessionId,
						userId: user.id,
						feedbackLanguage: user.nativeLanguage ?? note.language,
						itemText: `${note.vocab}\n${note.targetDefinition}\n${note.nativeDefinition}`,
						category: "vocabulary",
						question,
						currentContext: `${note.targetDefinition}\n${note.nativeDefinition}`,
					})
				: await followUpOnLearningContent({
						userId: user.id,
						learningLanguage: note.language,
						feedbackLanguage: user.nativeLanguage ?? note.language,
						itemText: `${note.vocab}\n${note.targetDefinition}\n${note.nativeDefinition}`,
						category: "vocabulary",
						question,
						currentContext: `${note.targetDefinition}\n${note.nativeDefinition}`,
					});
			return { success: true, answer: result.answer };
		} catch (e) {
			return fail(llmErrorStatus(e), { error: llmErrorMessage(e) });
		}
	},
};
