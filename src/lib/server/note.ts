import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getLanguageEnglishName } from "$lib/constants";
import { db } from "./db";
import { note, practiceSession, sessionMessage } from "./db/schema";
import { chatJson } from "./llm";

// ── Types ──────────────────────────────────────────────────────────

export interface CreateNoteInput {
	userId: string;
	sourceSessionId: number;
	sourceMessageId?: number;
	tutorComment: string;
	keywords?: string[];
	sourceContext?: string;
}

// ── createNote ─────────────────────────────────────────────────────

export async function createNote(input: CreateNoteInput) {
	const [result] = await db
		.insert(note)
		.values({
			userId: input.userId,
			sourceSessionId: input.sourceSessionId,
			sourceMessageId: input.sourceMessageId ?? null,
			tutorComment: input.tutorComment,
			keywords: input.keywords ?? null,
			sourceContext: input.sourceContext ?? null,
		})
		.returning();

	return result;
}

// ── createNotesBatch ───────────────────────────────────────────────

const ExtractKnowledgeSchema = z.object({
	items: z.array(
		z.object({
			knowledgePoint: z.string(),
			keywords: z
				.array(z.string())
				.describe(
					"2-3 short core terms/phrases in the learning language (e.g., a key word, collocation, or grammar formula like 'no porque + subj.')",
				),
			sourceContext: z.string().describe("1-3 sentences of the original conversation that illustrate the error or the language point"),
		}),
	),
});

export async function createNotesBatch(
	userId: string,
	sourceSessionId: number,
	language: string,
	feedbackItems: { tutorComment: string; category?: "grammar" | "vocabulary" | "coherence" }[],
) {
	if (feedbackItems.length === 0) return [];

	const session = await db.query.practiceSession.findFirst({
		where: eq(practiceSession.id, sourceSessionId),
		with: {
			messages: {
				orderBy: asc(sessionMessage.createdAt),
				columns: { role: true, content: true },
			},
		},
	});
	const conversationSnippet =
		session?.messages
			.filter((m) => m.content && m.content.trim().length > 0)
			.map((m) => `[${m.role}] ${m.content.slice(0, 300)}`)
			.join("\n")
			.slice(0, 3000) ?? "";

	const knowledgeMap: Map<number, { knowledgePoint: string; keywords: string[]; sourceContext: string }> = new Map();
	if (feedbackItems.length > 0) {
		const languageName = getLanguageEnglishName(language);
		const knowledgeResult = await chatJson(ExtractKnowledgeSchema, {
			messages: [
				{
					role: "system" as const,
					content: `You are an expert ${languageName} language tutor. For each feedback item below, distill the core lesson into a concise knowledge point and extract keywords + context.

For each item, produce:
- **knowledgePoint**: ONE concise sentence summarizing the core lesson (grammar rule, vocabulary nuance, or discourse principle). Be specific, name the rule. Write in English but mention ${languageName} terms.
- **keywords**: 2-3 very short core terms or phrases that capture the essence. These MUST be in ${languageName} (or the learning language), shown as a concise label — e.g., "el enlace", "función | funcionario", "no porque + subj.", "set ... on fire", "behind the scenes". Keep each under ~5 words.
- **sourceContext**: 1-3 sentences quoted or closely paraphrased from the original conversation that illustrate the error or the correct usage. Extract this from the conversation snippet provided. If the conversation doesn't clearly show the context, write a brief summary.

CRITICAL RULES:
- Do NOT repeat the error description verbatim in knowledgePoint. Distill the lesson.
- Keywords should be useful standalone notes: grammar formulas, collocations, word pairs.
- Return JSON: { "items": [{ "knowledgePoint": "...", "keywords": ["..."], "sourceContext": "..." }] }`,
				},
				{
					role: "user" as const,
					content: [
						`## Conversation (for source context extraction)\n${conversationSnippet || "(No conversation available)"}`,
						`## Feedback Items to process\n${feedbackItems.map((item, i) => `Item ${i + 1} [${item.category ?? "general"}]: ${item.tutorComment}`).join("\n\n")}`,
					].join("\n\n"),
				},
			],
			userId,
		});
		knowledgeResult.items.forEach((item, i) => {
			knowledgeMap.set(i, {
				knowledgePoint: item.knowledgePoint,
				keywords: item.keywords,
				sourceContext: item.sourceContext,
			});
		});
	}

	const referenceNotes = feedbackItems.map((item, i) => {
		const extracted = knowledgeMap.get(i);
		return {
			userId,
			sourceSessionId,
			tutorComment: extracted?.knowledgePoint ?? item.tutorComment,
			keywords: extracted?.keywords ?? null,
			sourceContext: extracted?.sourceContext ?? null,
		};
	});

	return db.insert(note).values(referenceNotes).returning();
}

// ── listNotes ──────────────────────────────────────────────────────

export async function listNotes(userId: string) {
	return db.select().from(note).where(eq(note.userId, userId)).orderBy(desc(note.id));
}

// ── getNote ────────────────────────────────────────────────────────

export async function getNote(noteId: number, userId: string) {
	return db.query.note.findFirst({
		where: and(eq(note.id, noteId), eq(note.userId, userId)),
	});
}

// ── updateNote ─────────────────────────────────────────────────────

export async function updateNote(noteId: number, userId: string, data: { tutorComment?: string; keywords?: string[] }) {
	const [updated] = await db
		.update(note)
		.set(data)
		.where(and(eq(note.id, noteId), eq(note.userId, userId)))
		.returning();

	return updated;
}

// ── deleteNote ─────────────────────────────────────────────────────

export async function deleteNote(noteId: number, userId: string) {
	const [deleted] = await db
		.delete(note)
		.where(and(eq(note.id, noteId), eq(note.userId, userId)))
		.returning();

	return deleted;
}

// ── validateAndCreateNoteFromSelection ─────────────────────────────

const ValidateSelectionSchema = z.discriminatedUnion("valid", [
	z.object({
		valid: z.literal(true),
		knowledgePoint: z.string(),
		keywords: z.array(z.string()).describe("2-3 short core terms in the learning language"),
		sourceContext: z.string().describe("1-3 sentences of original context"),
	}),
	z.object({ valid: z.literal(false), reason: z.string() }),
]);

export async function validateAndCreateNoteFromSelection(input: {
	userId: string;
	sessionId: number;
	selectedText: string;
	surroundingContext: string;
	language: string;
}) {
	const languageName = getLanguageEnglishName(input.language);

	const contextBlock = `\n## Surrounding text for context\n"${input.surroundingContext}"`;

	const result = await chatJson(ValidateSelectionSchema, {
		messages: [
			{
				role: "system" as const,
				content: `You are an expert ${languageName} language tutor. A learner has selected some text from a conversation and wants to save it as a reference note.

Your job:
1. Decide whether the selection is a **meaningful, self-contained language point** worth remembering.
2. If valid, extract a concise knowledge point (one sentence), 2-3 short keywords in ${languageName}, and the original context (1-3 sentences).
3. If invalid, explain why in one short sentence.

Reject if the selection is:
- Too short (1-2 words with no clear language point)
- An incomplete or broken sentence fragment
- Nonsensical or gibberish
- A generic greeting or filler phrase with nothing to learn
- Just a name, number, or punctuation

Accept if the selection contains:
- A complete phrase or sentence with a clear grammar pattern
- An idiomatic expression, collocation, or interesting word usage
- A discourse connector or structural pattern
- A correctly or incorrectly used language feature worth studying

Return JSON:
- If valid: { "valid": true, "knowledgePoint": "...", "keywords": ["..."], "sourceContext": "..." }
- If invalid: { "valid": false, "reason": "..." }`,
			},
			{
				role: "user" as const,
				content: `Selected text: "${input.selectedText}"${contextBlock}`,
			},
		],
		userId: input.userId,
	});

	if (!result.valid) {
		return { success: false as const, reason: result.reason };
	}

	const created = await createNote({
		userId: input.userId,
		sourceSessionId: input.sessionId,
		tutorComment: result.knowledgePoint,
		keywords: result.keywords,
		sourceContext: result.sourceContext,
	});

	return { success: true as const, note: created };
}

// ── createNoteFromSelectionQA ──────────────────────────────────────

const DistillQASchema = z.object({
	knowledgePoint: z.string(),
	keywords: z.array(z.string()).describe("2-3 short core terms in the learning language"),
	sourceContext: z.string().describe("1-3 sentences of original context"),
});

export async function createNoteFromSelectionQA(input: {
	userId: string;
	sessionId: number;
	selectedText: string;
	surroundingContext: string;
	question: string;
	answer: string;
	language: string;
}) {
	const languageName = getLanguageEnglishName(input.language);

	const result = await chatJson(DistillQASchema, {
		messages: [
			{
				role: "system" as const,
				content: `You are an expert ${languageName} language tutor. A learner selected text from a conversation, asked a follow-up question about it, and received an answer. Distill the key lesson from this Q&A into a concise knowledge point (one sentence), 2-3 short keywords in ${languageName}, and the original context (1-3 sentences). Focus on the grammar rule, vocabulary nuance, or language principle the learner should remember.

Write the knowledge point in English, but mention ${languageName} terms where relevant. Keywords should be in ${languageName}.

Return JSON: { "knowledgePoint": "...", "keywords": ["..."], "sourceContext": "..." }`,
			},
			{
				role: "user" as const,
				content: [
					`Selected text: "${input.selectedText}"`,
					`Surrounding context: "${input.surroundingContext}"`,
					`Question: "${input.question}"`,
					`Answer: "${input.answer}"`,
				].join("\n\n"),
			},
		],
		userId: input.userId,
	});

	const created = await createNote({
		userId: input.userId,
		sourceSessionId: input.sessionId,
		tutorComment: result.knowledgePoint,
		keywords: result.keywords,
		sourceContext: result.sourceContext,
	});

	return { success: true as const, note: created };
}
