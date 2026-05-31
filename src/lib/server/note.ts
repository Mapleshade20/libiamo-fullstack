import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getLanguageEnglishName } from "$lib/constants";
import { db } from "./db";
import { note, practiceSession } from "./db/schema";
import { chatJson } from "./llm";
import { sessionMessageChronologicalOrder } from "./session-message-ordering";

// ── createNote ─────────────────────────────────────────────────────

interface CreateNoteInput {
	userId: string;
	sourceSessionId: number;
	sourceMessageId?: number;
	tutorComment: string;
	keywords?: string[];
	sourceContext?: string;
}

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

// ── shared note extraction guidelines ─────────────────────────────

function getNoteFieldGuidelines(languageName: string) {
	return {
		knowledgePoint: `ONE concise sentence summarizing the core lesson (grammar rule, vocabulary nuance, or discourse principle). Be specific. Write in English but mention ${languageName} terms.`,
		keywords: `1-2 very short core phrases that capture the essence. These MUST be in ${languageName} (or the learning language), shown as a concise label — e.g. grammar like "cualquier + n. (neutral)", "n. + cualquiera (implying indifference)", vocabulary like "resonate with someone", "no porque + subj.", "set ... on fire", "behind the scenes", "think of | come up with". Keep each under ~5 words.`,
		sourceContext:
			"1-3 sentences quoted or closely paraphrased that the feedback items come from. Extract this from the original conversation snippet provided, and make sure you replace the wrong or problematic language with the correct form if possible, to show the learner the right way to say it in context.",
	};
}

function formatNoteFieldGuidelines(languageName: string) {
	const guidelines = getNoteFieldGuidelines(languageName);
	return [
		`- knowledgePoint: ${guidelines.knowledgePoint}`,
		`- keywords: ${guidelines.keywords}`,
		`- sourceContext: ${guidelines.sourceContext}`,
	].join("\n");
}

const schemaNoteFieldGuidelines = getNoteFieldGuidelines("the learning language");

// ── createNotesBatch ───────────────────────────────────────────────

const ExtractKnowledgeSchema = z.object({
	items: z.array(
		z.object({
			knowledgePoint: z.string().describe(schemaNoteFieldGuidelines.knowledgePoint),
			keywords: z.array(z.string()).describe(schemaNoteFieldGuidelines.keywords),
			sourceContext: z.string().describe(schemaNoteFieldGuidelines.sourceContext),
		}),
	),
});

export async function createNotesBatch(
	userId: string,
	sourceSessionId: number,
	language: string,
	feedbackItems: { tutorComment: string; category?: "grammar" | "vocabulary" | "coherence"; sourceContext?: string }[],
	sessionOwnerId?: string,
) {
	if (feedbackItems.length === 0) return [];

	const session = await db.query.practiceSession.findFirst({
		where: and(eq(practiceSession.id, sourceSessionId), sessionOwnerId ? eq(practiceSession.userId, sessionOwnerId) : undefined),
		with: {
			messages: {
				orderBy: sessionMessageChronologicalOrder,
				columns: { role: true, content: true },
			},
		},
	});
	if (sessionOwnerId && !session) throw new Error("Session not found");
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
${formatNoteFieldGuidelines(languageName)}

CRITICAL RULES:
- Do NOT repeat the error description verbatim in knowledgePoint. Distill the lesson.
- Return JSON: { "items": [{ "knowledgePoint": "...", "keywords": ["..."], "sourceContext": "..." }] }`,
				},
				{
					role: "user" as const,
					content: [
						`## Conversation (for source context extraction)\n${conversationSnippet || "(No conversation available)"}`,
						`## Feedback Items to process\n${feedbackItems
							.map((item, i) => {
								const context = item.sourceContext ? `\nContext for this item:\n${item.sourceContext}` : "";
								return `Item ${i + 1} [${item.category ?? "general"}]: ${item.tutorComment}${context}`;
							})
							.join("\n\n")}`,
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

// ── createNotesFromSelectionBatch ──────────────────────────────────

const SelectionNotesSchema = z.object({
	reason: z.string().optional().describe("Short reason when no notes are created."),
	items: z.array(
		z.object({
			knowledgePoint: z.string().describe(schemaNoteFieldGuidelines.knowledgePoint),
			keywords: z.array(z.string()).describe(schemaNoteFieldGuidelines.keywords),
			sourceContext: z.string().describe(schemaNoteFieldGuidelines.sourceContext),
		}),
	),
});

export async function createNotesFromSelectionBatch(input: {
	userId: string;
	sessionId: number;
	language: string;
	selectedText: string;
	currentContext: string;
	previousContext?: string;
	sourceKind?: string;
}) {
	const selectedText = input.selectedText.trim();
	if (!selectedText) return { success: true as const, notes: [], count: 0, reason: "Selection is empty." };

	const languageName = getLanguageEnglishName(input.language);
	const result = await chatJson(SelectionNotesSchema, {
		messages: [
			{
				role: "system" as const,
				content: `You are an expert ${languageName} language tutor. A learner selected text on their feedback review page and clicked “save to notes”.

Create between 0 and 2 useful reference notes from the selection.

Return 0 notes if the selection is too short, generic, broken, only UI text, or does not contain a worthwhile ${languageName} language-learning point. Long selections may contain several points; choose only the best 1-2.

For each note:
${formatNoteFieldGuidelines(languageName)}

Return JSON: { "items": [], "reason": "..." } or { "items": [{ "knowledgePoint": "...", "keywords": ["..."], "sourceContext": "..." }] }`,
			},
			{
				role: "user" as const,
				content: [
					`Selected text:\n${selectedText}`,
					`Source area: ${input.sourceKind ?? "feedback review"}`,
					`Previous visible message/context:\n${input.previousContext?.trim() || "(none)"}`,
					`Current message/comment/context:\n${input.currentContext.trim() || "(none)"}`,
				].join("\n\n"),
			},
		],
		userId: input.userId,
	});

	const items = result.items.slice(0, 3);
	if (items.length === 0) {
		return { success: true as const, notes: [], count: 0, reason: result.reason ?? "No note-worthy point found." };
	}

	const created = await db
		.insert(note)
		.values(
			items.map((item) => ({
				userId: input.userId,
				sourceSessionId: input.sessionId,
				tutorComment: item.knowledgePoint,
				keywords: item.keywords,
				sourceContext: item.sourceContext,
			})),
		)
		.returning();

	return { success: true as const, notes: created, count: created.length, reason: null };
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

// ── createNoteFromSelectionQA ──────────────────────────────────────

const DistillQASchema = z.object({
	knowledgePoint: z.string().describe(schemaNoteFieldGuidelines.knowledgePoint),
	keywords: z.array(z.string()).describe(schemaNoteFieldGuidelines.keywords),
	sourceContext: z.string().describe(schemaNoteFieldGuidelines.sourceContext),
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
				content: `You are an expert ${languageName} language tutor. A learner selected text from a conversation, asked a follow-up question about it, and received an answer.

Distill the key lesson from this Q&A into:
${formatNoteFieldGuidelines(languageName)}

Focus on the grammar rule, vocabulary building or nuance the learner should remember.

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
