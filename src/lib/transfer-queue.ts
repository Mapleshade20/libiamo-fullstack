/**
 * The post-task transfer pass queue, shared by translation attempts and practice sessions.
 *
 * Incorrect sends the note to the tail with a fresh example and no attempt cap; Pass removes it.
 * Repeats inside a pass travel through this queue, never through a card's due date.
 */

import type { StudyQueueKind } from "$lib/review";

export type TransferQueueItem = { noteId: number; exampleIndex: number; queueKind: StudyQueueKind };

export type TransferQueueState = {
	initialized: boolean;
	queue: TransferQueueItem[];
};

/** A note as the transfer card UI needs it: one note, one chosen example. */
export type TransferNote = {
	id: number;
	vocab: string;
	targetDefinition: string;
	nativeDefinition: string;
	queueKind: StudyQueueKind;
	examples: Array<{ targetText: string; nativeText: string }>;
};

export function advanceTransferQueue(
	queue: readonly TransferQueueItem[],
	outcome: "incorrect" | "pass",
	nextExampleIndex?: number,
): TransferQueueItem[] {
	const [active, ...remaining] = queue;
	if (!active) return [];
	if (outcome === "pass") return remaining;
	if (!Number.isInteger(nextExampleIndex) || Number(nextExampleIndex) < 0)
		throw new Error("A valid next example is required after an incorrect answer.");
	return [...remaining, { noteId: active.noteId, exampleIndex: Number(nextExampleIndex), queueKind: "learning" }];
}

export function isTransferQueueState(value: unknown): value is TransferQueueState {
	if (!value || typeof value !== "object") return false;
	const state = value as Partial<TransferQueueState>;
	return (
		typeof state.initialized === "boolean" &&
		Array.isArray(state.queue) &&
		state.queue.every(
			(item) =>
				!!item &&
				typeof item === "object" &&
				Number.isInteger((item as { noteId?: unknown }).noteId) &&
				Number((item as { noteId: number }).noteId) > 0 &&
				Number.isInteger((item as { exampleIndex?: unknown }).exampleIndex) &&
				Number((item as { exampleIndex: number }).exampleIndex) >= 0 &&
				["new", "learning", "review"].includes(String((item as { queueKind?: unknown }).queueKind)),
		)
	);
}

type SourceNote = {
	id: number;
	vocab: string;
	targetDefinition: string;
	nativeDefinition: string;
	examples: Array<{ targetText: string; nativeText: string }>;
};

/** The queue resolved against the loaded notes, dropping entries whose note or example vanished. */
export function transferQueueNotes(queue: readonly TransferQueueItem[], notes: readonly SourceNote[]): TransferNote[] {
	return queue.flatMap((entry) => {
		const note = notes.find((item) => item.id === entry.noteId);
		const example = note?.examples[entry.exampleIndex];
		if (!note || !example) return [];
		return [
			{
				id: note.id,
				vocab: note.vocab,
				targetDefinition: note.targetDefinition,
				nativeDefinition: note.nativeDefinition,
				queueKind: entry.queueKind,
				examples: [example],
			},
		];
	});
}
