export const NOTE_EXAMPLE_COUNT = 4;

export type NoteExample = {
	targetText: string;
	nativeText: string;
};

export type NoteContent = {
	vocab: string;
	targetDefinition: string;
	nativeDefinition: string;
	examples: NoteExample[];
};

export function randomExampleIndex(examples: readonly NoteExample[], random = Math.random): number {
	if (examples.length === 0) throw new Error("A note must contain at least one example.");
	return Math.min(examples.length - 1, Math.floor(random() * examples.length));
}

export function parseNoteExamples(value: unknown): NoteExample[] {
	if (!Array.isArray(value) || value.length === 0) throw new Error("A note must contain at least one example.");
	return value.map((example) => {
		if (
			!example ||
			typeof example !== "object" ||
			typeof (example as Partial<NoteExample>).targetText !== "string" ||
			!(example as NoteExample).targetText.trim() ||
			typeof (example as Partial<NoteExample>).nativeText !== "string" ||
			!(example as NoteExample).nativeText.trim()
		) {
			throw new Error("A note contains an invalid example.");
		}
		return {
			targetText: (example as NoteExample).targetText.trim(),
			nativeText: (example as NoteExample).nativeText.trim(),
		};
	});
}
