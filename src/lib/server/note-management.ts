import { and, count, desc, eq, isNotNull, sql } from "drizzle-orm";
import type { LanguageCode } from "$lib/constants";
import { parseNoteExamples } from "$lib/note";
import type { ManagedNote, NoteQueueFilter, NoteSourceFilter } from "$lib/note-management";
import { db } from "./db";
import { note } from "./db/schema";
import { deserializeCard, State, studyQueueKind } from "./review";

export const MANAGED_NOTES_PAGE_SIZE = 50;

export type ManagedNoteFilters = {
	search: string;
	language: LanguageCode | "all";
	queue: NoteQueueFilter;
	source: NoteSourceFilter;
	page: number;
	selectedNoteId?: number;
};

export function toManagedNote(row: typeof note.$inferSelect): ManagedNote {
	const card = deserializeCard(row.fsrsCard);
	return {
		id: row.id,
		language: row.language,
		vocab: row.vocab,
		targetDefinition: row.targetDefinition,
		nativeDefinition: row.nativeDefinition,
		examples: parseNoteExamples(row.examples),
		queueKind: studyQueueKind(card),
		due: card.due.toISOString(),
		reps: card.reps,
		lapses: card.lapses,
		sourceType: row.sourceSessionId ? "practice" : "translation",
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	};
}

export async function browseManagedNotes(userId: string, filters: ManagedNoteFilters) {
	const conditions = [eq(note.userId, userId)];
	if (filters.language !== "all") conditions.push(eq(note.language, filters.language));
	if (filters.source === "practice") conditions.push(isNotNull(note.sourceSessionId));
	if (filters.source === "translation") conditions.push(isNotNull(note.sourceTranslationAttemptId));
	if (filters.queue === "new") conditions.push(sql`(${note.fsrsCard}->>'state')::int = ${State.New}`);
	if (filters.queue === "learning") conditions.push(sql`(${note.fsrsCard}->>'state')::int IN (${State.Learning}, ${State.Relearning})`);
	if (filters.queue === "review") conditions.push(sql`(${note.fsrsCard}->>'state')::int = ${State.Review}`);
	if (filters.search) {
		conditions.push(
			sql`position(lower(${filters.search}) in lower(concat_ws(' ', ${note.vocab}, ${note.targetDefinition}, ${note.nativeDefinition}, ${note.examples}::text))) > 0`,
		);
	}

	const where = and(...conditions);
	const offset = (filters.page - 1) * MANAGED_NOTES_PAGE_SIZE;
	const [rows, totalRows, selectedRows] = await Promise.all([
		db.select().from(note).where(where).orderBy(desc(note.updatedAt), desc(note.id)).limit(MANAGED_NOTES_PAGE_SIZE).offset(offset),
		db.select({ count: count() }).from(note).where(where),
		filters.selectedNoteId
			? db
					.select()
					.from(note)
					.where(and(where, eq(note.id, filters.selectedNoteId)))
					.limit(1)
			: Promise.resolve([]),
	]);

	return {
		notes: rows.map(toManagedNote),
		selectedNote: selectedRows[0] ? toManagedNote(selectedRows[0]) : null,
		total: totalRows[0]?.count ?? 0,
	};
}
