import type { LanguageCode } from "$lib/constants";
import type { NoteExample } from "$lib/note";
import type { StudyQueueKind } from "$lib/review";

export const NOTE_SOURCE_FILTERS = ["all", "practice", "translation"] as const;
export type NoteSourceFilter = (typeof NOTE_SOURCE_FILTERS)[number];

export const NOTE_QUEUE_FILTERS = ["all", "new", "learning", "review"] as const;
export type NoteQueueFilter = (typeof NOTE_QUEUE_FILTERS)[number];

export type ManagedNote = {
	id: number;
	language: LanguageCode;
	vocab: string;
	targetDefinition: string;
	nativeDefinition: string;
	examples: NoteExample[];
	queueKind: StudyQueueKind;
	due: string;
	reps: number;
	lapses: number;
	sourceType: Exclude<NoteSourceFilter, "all">;
	createdAt: string;
	updatedAt: string;
};
