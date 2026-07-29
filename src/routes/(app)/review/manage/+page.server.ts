import { fail } from "@sveltejs/kit";
import { LANGUAGE_CODES, type LanguageCode } from "$lib/constants";
import { NOTE_QUEUE_FILTERS, NOTE_SOURCE_FILTERS, type NoteQueueFilter, type NoteSourceFilter } from "$lib/note-management";
import { managedNoteIdSchema, managedNoteSetDueSchema, managedNoteUpdateSchema } from "$lib/schemas";
import { requireUser } from "$lib/server/auth/authz";
import { deleteNote, updateNote } from "$lib/server/note";
import { browseManagedNotes, MANAGED_NOTES_PAGE_SIZE, toManagedNote } from "$lib/server/note-management";
import { resetNoteScheduling, setNoteDueInDays } from "$lib/server/review";
import type { Actions, PageServerLoad } from "./$types";

function supportedValue<T extends readonly string[]>(values: T, value: string | null, fallback: T[number]): T[number] {
	return value && values.includes(value) ? (value as T[number]) : fallback;
}

function firstValidationError(result: { error: { issues: Array<{ message: string }> } }) {
	return result.error.issues[0]?.message ?? "Invalid request";
}

export const load: PageServerLoad = async (event) => {
	const user = requireUser(event);
	const search = (event.url.searchParams.get("q") ?? "").trim().slice(0, 200);
	const language = supportedValue(["all", ...LANGUAGE_CODES] as const, event.url.searchParams.get("language"), "all") as LanguageCode | "all";
	const queue = supportedValue(NOTE_QUEUE_FILTERS, event.url.searchParams.get("queue"), "all") as NoteQueueFilter;
	const source = supportedValue(NOTE_SOURCE_FILTERS, event.url.searchParams.get("source"), "all") as NoteSourceFilter;
	const rawPage = Number.parseInt(event.url.searchParams.get("page") ?? "1", 10);
	const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
	const rawSelectedNoteId = Number(event.url.searchParams.get("note"));
	const selectedNoteId = Number.isInteger(rawSelectedNoteId) && rawSelectedNoteId > 0 ? rawSelectedNoteId : undefined;
	const filters = { search, language, queue, source, page, selectedNoteId };
	const result = await browseManagedNotes(user.id, filters);

	return {
		...result,
		filters,
		pageSize: MANAGED_NOTES_PAGE_SIZE,
		totalPages: Math.max(1, Math.ceil(result.total / MANAGED_NOTES_PAGE_SIZE)),
	};
};

export const actions: Actions = {
	update: async (event) => {
		const user = requireUser(event);
		const formData = await event.request.formData();
		let examples: unknown;
		try {
			examples = JSON.parse(formData.get("examples")?.toString() ?? "");
		} catch {
			return fail(400, { error: "Examples must be valid JSON" });
		}
		const result = managedNoteUpdateSchema.safeParse({
			noteId: formData.get("noteId"),
			language: formData.get("language"),
			vocab: formData.get("vocab"),
			targetDefinition: formData.get("targetDefinition"),
			nativeDefinition: formData.get("nativeDefinition"),
			examples,
		});
		if (!result.success) return fail(400, { error: firstValidationError(result) });

		const { noteId, ...content } = result.data;
		const updated = await updateNote(noteId, user.id, content);
		if (!updated) return fail(404, { error: "Note not found" });
		return { success: true, note: toManagedNote(updated) };
	},

	setDue: async (event) => {
		const user = requireUser(event);
		const formData = await event.request.formData();
		const result = managedNoteSetDueSchema.safeParse({ noteId: formData.get("noteId"), days: formData.get("days") });
		if (!result.success) return fail(400, { error: firstValidationError(result) });
		const updated = await setNoteDueInDays(result.data.noteId, user.id, result.data.days);
		if (!updated) return fail(404, { error: "Note not found" });
		return { success: true, scheduling: updated };
	},

	reset: async (event) => {
		const user = requireUser(event);
		const formData = await event.request.formData();
		const result = managedNoteIdSchema.safeParse({ noteId: formData.get("noteId") });
		if (!result.success) return fail(400, { error: firstValidationError(result) });
		const updated = await resetNoteScheduling(result.data.noteId, user.id);
		if (!updated) return fail(404, { error: "Note not found" });
		return { success: true, scheduling: updated };
	},

	delete: async (event) => {
		const user = requireUser(event);
		const formData = await event.request.formData();
		const result = managedNoteIdSchema.safeParse({ noteId: formData.get("noteId") });
		if (!result.success) return fail(400, { error: firstValidationError(result) });
		const deleted = await deleteNote(result.data.noteId, user.id);
		if (!deleted) return fail(404, { error: "Note not found" });
		return { success: true, noteId: deleted.id };
	},
};
