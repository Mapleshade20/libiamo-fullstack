import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getLanguageEnglishName, type LanguageCode } from "$lib/constants";
import { NOTE_EXAMPLE_COUNT, type NoteContent } from "$lib/note";
import { db } from "./db";
import { note, practiceSession, translationAttempt } from "./db/schema";
import { chatJson } from "./llm";
import { createNewCard, serializeCard } from "./review";
import { sessionMessageChronologicalOrder } from "./session";

export type NoteSource = { type: "practice"; sessionId: number } | { type: "translation"; attemptId: number };

const ExampleSchema = z.object({ targetText: z.string().trim().min(1), nativeText: z.string().trim().min(1) }).strict();
const GeneratedNoteSchema = z
	.object({
		sourceItemOrdinals: z.array(z.number().int().nonnegative()).min(1),
		vocab: z.string().trim().min(1),
		targetDefinition: z.string().trim().min(1),
		nativeDefinition: z.string().trim().min(1),
		examples: z.array(ExampleSchema).length(NOTE_EXAMPLE_COUNT),
	})
	.strict();
const GeneratedNotesSchema = z.object({ notes: z.array(GeneratedNoteSchema) }).strict();

export type GeneratedNote = z.infer<typeof GeneratedNoteSchema>;

function validateGeneratedNotes(notes: GeneratedNote[], itemCount: number, maxNotes?: number) {
	if (maxNotes !== undefined && notes.length > maxNotes) throw new Error(`The tutor returned more than ${maxNotes} notes.`);
	for (const generated of notes) {
		const examples = new Set(generated.examples.map((example) => `${example.targetText}\u0000${example.nativeText}`));
		if (examples.size !== NOTE_EXAMPLE_COUNT) throw new Error(`Every note must contain ${NOTE_EXAMPLE_COUNT} distinct examples.`);
		for (const ordinal of generated.sourceItemOrdinals) {
			if (ordinal >= itemCount) throw new Error("Generated notes contain an invalid source item ordinal.");
		}
	}
}

export type CreateNotesInput = {
	userId: string;
	language: LanguageCode;
	source: NoteSource;
	notes: NoteContent[];
};

export async function insertNotes(writer: Pick<typeof db, "insert">, input: CreateNotesInput) {
	if (input.notes.length === 0) return [];
	for (const generated of input.notes) {
		if (!generated.vocab.trim() || !generated.targetDefinition.trim() || !generated.nativeDefinition.trim()) {
			throw new Error("Note content must not be empty.");
		}
		if (generated.examples.length !== NOTE_EXAMPLE_COUNT) throw new Error(`Every note must contain exactly ${NOTE_EXAMPLE_COUNT} examples.`);
		if (
			new Set(generated.examples.map((example) => `${example.targetText.trim()}\u0000${example.nativeText.trim()}`)).size !== NOTE_EXAMPLE_COUNT ||
			generated.examples.some((example) => !example.targetText.trim() || !example.nativeText.trim())
		) {
			throw new Error(`Every note must contain ${NOTE_EXAMPLE_COUNT} distinct non-empty examples.`);
		}
	}

	return writer
		.insert(note)
		.values(
			input.notes.map((generated) => ({
				userId: input.userId,
				language: input.language,
				sourceSessionId: input.source.type === "practice" ? input.source.sessionId : null,
				sourceTranslationAttemptId: input.source.type === "translation" ? input.source.attemptId : null,
				vocab: generated.vocab.trim(),
				targetDefinition: generated.targetDefinition.trim(),
				nativeDefinition: generated.nativeDefinition.trim(),
				examples: generated.examples.map((example) => ({
					targetText: example.targetText.trim(),
					nativeText: example.nativeText.trim(),
				})),
				fsrsCard: serializeCard(createNewCard()),
			})),
		)
		.returning();
}

export async function createNotes(input: CreateNotesInput) {
	return db.transaction((transaction) => insertNotes(transaction, input));
}

function notesSystemPrompt(input: { targetLanguage: string; nativeLanguage: string; maximumNotes?: number }) {
	const target = getLanguageEnglishName(input.targetLanguage);
	const native = getLanguageEnglishName(input.nativeLanguage);
	const outputShape = {
		notes: [
			{
				sourceItemOrdinals: [0],
				vocab: "...",
				targetDefinition: "...",
				nativeDefinition: "...",
				examples: Array.from({ length: NOTE_EXAMPLE_COUNT }, () => ({ targetText: "...", nativeText: "..." })),
			},
		],
	};
	return `Turn selected tutor feedback into reusable ${target} vocabulary notes for a learner whose native language is ${native}. Return JSON only, with exactly this shape:
${JSON.stringify(outputShape, null, 2)}

CONTRACT
- Return an empty notes array when none of the supplied items identifies a concrete reusable ${target} word or expression.
- vocab is the exact ${target} item the learner needs to acquire: use a single word when that word is independently useful, or a lexical chunk when this context requires a fixed or semi-fixed collocation, phrasal verb, fixed phrase, idiom, or functional formula. Never return an abstract grammar pattern, sentence template, slash-separated alternatives, or the learner's incorrect form.
- Derive vocab from the corrected or natural ${target} wording evidenced by the supplied feedback and context. Merge items only when they teach the same vocab. A source item may support more than one note only when it contains distinct vocabulary items.
- targetDefinition is a concise dictionary-style definition written entirely in ${target}. nativeDefinition is its concise dictionary-style equivalent written entirely in ${native}. They define vocab; they are not grammar lessons or study advice.
- Every note has exactly ${NOTE_EXAMPLE_COUNT} distinct examples from varied everyday contexts. targetText is a natural ${target} sentence that uses vocab (allowing grammatically required inflection); nativeText is an accurate, independently natural ${native} translation with the same meaning.
- Do not turn examples into cloze prompts, definitions, fragments, or copies with only names changed.
${input.maximumNotes ? `- Return at most ${input.maximumNotes} notes.` : ""}
- Do not add fields.`;
}

async function generateNotes(input: { userId: string; targetLanguage: string; nativeLanguage: string; items: unknown[]; maximumNotes?: number }) {
	const { value } = await chatJson({
		schema: GeneratedNotesSchema,
		messages: [
			{ role: "system", content: notesSystemPrompt(input) },
			{ role: "user", content: JSON.stringify({ items: input.items }) },
		],
		userId: input.userId,
	});
	validateGeneratedNotes(value.notes, input.items.length, input.maximumNotes);
	return value.notes;
}

export async function createNotesBatch(input: {
	userId: string;
	source: NoteSource;
	language: LanguageCode;
	nativeLanguage: string;
	feedbackItems: Array<{ tutorComment: string; category?: "grammar" | "vocabulary" | "coherence"; sourceContext?: string }>;
	sessionOwnerId?: string;
}) {
	if (input.feedbackItems.length === 0) return [];

	let conversationSnippet = "";
	if (input.source.type === "practice") {
		const session = await db.query.practiceSession.findFirst({
			where: and(eq(practiceSession.id, input.source.sessionId), input.sessionOwnerId ? eq(practiceSession.userId, input.sessionOwnerId) : undefined),
			with: { messages: { orderBy: sessionMessageChronologicalOrder, columns: { role: true, content: true } } },
		});
		if (input.sessionOwnerId && !session) throw new Error("Session not found");
		conversationSnippet =
			session?.messages
				.filter((message) => message.content.trim())
				.map((message) => `[${message.role}] ${message.content.slice(0, 300)}`)
				.join("\n")
				.slice(0, 3000) ?? "";
	} else if (input.sessionOwnerId) {
		const attempt = await db.query.translationAttempt.findFirst({
			where: and(eq(translationAttempt.id, input.source.attemptId), eq(translationAttempt.userId, input.sessionOwnerId)),
			columns: { id: true, workflowPhase: true },
		});
		if (!attempt || attempt.workflowPhase === "draft" || attempt.workflowPhase === "submitted") throw new Error("Translation attempt not found");
	}

	const generated = await generateNotes({
		userId: input.userId,
		targetLanguage: input.language,
		nativeLanguage: input.nativeLanguage,
		items: input.feedbackItems.map((item, ordinal) => ({ ordinal, ...item, conversationSnippet })),
	});
	return createNotes({ userId: input.userId, source: input.source, language: input.language, notes: generated });
}

export async function createNotesFromSelectionBatch(input: {
	userId: string;
	source: NoteSource;
	language: LanguageCode;
	nativeLanguage: string;
	selectedText: string;
	currentContext: string;
	previousContext?: string;
	sourceKind?: string;
}) {
	const selectedText = input.selectedText.trim();
	if (!selectedText) return { success: true as const, notes: [], count: 0, reason: "Selection is empty." };
	const generated = await generateNotes({
		userId: input.userId,
		targetLanguage: input.language,
		nativeLanguage: input.nativeLanguage,
		maximumNotes: 2,
		items: [{ ordinal: 0, selectedText, currentContext: input.currentContext, previousContext: input.previousContext, sourceKind: input.sourceKind }],
	});
	if (generated.length === 0) return { success: true as const, notes: [], count: 0, reason: "No reusable language point found." };
	const created = await createNotes({ userId: input.userId, source: input.source, language: input.language, notes: generated });
	return { success: true as const, notes: created, count: created.length, reason: null };
}

export async function createNoteFromSelectionQA(input: {
	userId: string;
	source: NoteSource;
	selectedText: string;
	surroundingContext: string;
	question: string;
	answer: string;
	language: LanguageCode;
	nativeLanguage: string;
}) {
	const generated = await generateNotes({
		userId: input.userId,
		targetLanguage: input.language,
		nativeLanguage: input.nativeLanguage,
		maximumNotes: 1,
		items: [
			{
				ordinal: 0,
				selectedText: input.selectedText,
				surroundingContext: input.surroundingContext,
				question: input.question,
				answer: input.answer,
			},
		],
	});
	if (generated.length === 0) return { success: true as const, note: null };
	const [created] = await createNotes({ userId: input.userId, source: input.source, language: input.language, notes: generated });
	return { success: true as const, note: created };
}

export async function listNotes(userId: string) {
	return db.select().from(note).where(eq(note.userId, userId)).orderBy(desc(note.id));
}

export async function getNote(noteId: number, userId: string) {
	return db.query.note.findFirst({
		where: and(eq(note.id, noteId), eq(note.userId, userId)),
	});
}

export async function updateNote(
	noteId: number,
	userId: string,
	data: {
		language?: LanguageCode;
		vocab?: string;
		targetDefinition?: string;
		nativeDefinition?: string;
		examples?: NoteContent["examples"];
	},
) {
	const [updated] = await db
		.update(note)
		.set({ ...data, updatedAt: new Date() })
		.where(and(eq(note.id, noteId), eq(note.userId, userId)))
		.returning();
	return updated;
}

export async function deleteNote(noteId: number, userId: string) {
	const [deleted] = await db
		.delete(note)
		.where(and(eq(note.id, noteId), eq(note.userId, userId)))
		.returning();
	return deleted;
}
