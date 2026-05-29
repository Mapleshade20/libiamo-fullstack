/**
 * Review card generation and CRUD operations.
 *
 * - createCardFromNote: LLM-powered single-card creation from a saved note
 * - getDueCards: fetch cards due for review
 * - rateCard: apply a review rating and persist the updated FSRS state
 * - getReviewStats: aggregate review statistics
 * - noteHasCard: check whether a note already has a review card
 */

import { and, asc, eq, isNull, lte, sql } from "drizzle-orm";
import type { Grade } from "ts-fsrs";
import { z } from "zod";
import { getLanguageEnglishName, type LanguageCode } from "$lib/constants";
import { db } from "./db";
import { note, reviewCard, reviewLog } from "./db/schema";
import { createNewCard, deserializeCard, getScheduler, Rating, serializeCard, serializeLog } from "./fsrs-scheduler";
import { chatJson } from "./llm";

// ── Card generation schema (LLM output) ────────────────────────────

const CardGenerationSchema = z.object({
	cardType: z.enum(["vocabulary", "expression", "grammar", "correction"]),
	front: z.string().describe("Question side: word/phrase/cloze/sentence in the learning language"),
	back: z.string().describe("Answer side: definition/explanation/rule in English"),
	context: z.string().optional().describe("Original context or example sentence (optional)"),
	shouldSkip: z.boolean().optional().describe("Set true if this note does not contain a concrete language point worth making a flashcard for"),
});

// ── noteHasCard ─────────────────────────────────────────────────────

export async function noteHasCard(noteId: number): Promise<boolean> {
	const card = await db.query.reviewCard.findFirst({
		where: eq(reviewCard.sourceNoteId, noteId),
		columns: { id: true },
	});
	return card !== undefined;
}

// ── createCardFromNote ──────────────────────────────────────────────

export async function createCardFromNote(noteId: number, userId: string, language?: string): Promise<{ created: boolean }> {
	const foundNote = await db.query.note.findFirst({
		where: and(eq(note.id, noteId), eq(note.userId, userId)),
		columns: { id: true, tutorComment: true, keywords: true, sourceContext: true },
	});

	if (!foundNote) throw new Error("Note not found");

	const existingCard = await db.query.reviewCard.findFirst({
		where: eq(reviewCard.sourceNoteId, noteId),
		columns: { id: true },
	});

	if (existingCard) {
		return { created: false };
	}

	// Determine language: use provided language or infer from associated session
	const sessionInfo = await db.query.note.findFirst({
		where: eq(note.id, noteId),
		with: {
			sourceSession: {
				columns: {},
				with: {
					task: { columns: { language: true } },
				},
			},
		},
	});

	const detectedLanguage = (language ?? sessionInfo?.sourceSession?.task?.language ?? "en") as LanguageCode;
	const languageName = getLanguageEnglishName(detectedLanguage);

	const result = await chatJson(CardGenerationSchema, {
		messages: [
			{
				role: "system",
				content: `You are an expert ${languageName} language tutor creating a review flashcard from a saved note.

Determine the best flashcard type and create content:

**vocabulary**: A specific word, phrase, or collocation the learner should memorize.
  - front: the word/phrase in ${languageName} (with furigana/romaji in parentheses if helpful)
  - back: English definition + one example sentence in ${languageName}

**expression**: An idiomatic expression, fixed phrase, or natural way to say something.
  - front: a cloze deletion or fill-in-the-blank (use "___" for the missing part) in ${languageName}
  - back: the complete expression + what it means in English + when to use it

**grammar**: A grammar rule, pattern, or structural point.
  - front: a sentence with the grammar point highlighted, or a grammar formula to complete
  - back: the rule explained in English + 2 example sentences in ${languageName}

**correction**: The learner said something incorrectly and got corrected.
  - front: the original INCORRECT sentence (marked as "What's wrong?")
  - back: the CORRECTED version + brief explanation of the mistake in English

**When to skip** (set shouldSkip: true):
- The note is too generic (e.g. "Be more careful with conjugations")
- The note doesn't contain a specific, concrete language point
- The note is just a general encouragement or observation
- The source context is too vague or missing to create a meaningful card

RULES:
- The card's front MUST contain ${languageName} text. The back should explain in English.
- Prefer cloze deletions for expression cards — they promote active recall.
- For correction cards, clearly show the WRONG → RIGHT contrast.
- Return JSON: { "cardType": "...", "front": "...", "back": "...", "context": "...", "shouldSkip": false }`,
			},
			{
				role: "user",
				content: `Create a review card for this saved note:\n\n**Lesson:** ${foundNote.tutorComment}\n${foundNote.keywords?.length ? `**Keywords:** ${foundNote.keywords.join(", ")}\n` : ""}${foundNote.sourceContext ? `**Context:** ${foundNote.sourceContext}` : ""}`,
			},
		],
		userId,
	});

	if (result.shouldSkip) {
		return { created: false };
	}

	const newCard = createNewCard();

	await db.insert(reviewCard).values({
		userId,
		sourceNoteId: noteId,
		language: detectedLanguage,
		cardType: result.cardType,
		front: result.front,
		back: result.back,
		context: result.context ?? null,
		fsrsCard: serializeCard(newCard),
	});

	return { created: true };
}

// ── getDueCards ──────────────────────────────────────────────────────

export async function getDueCards(
	userId: string,
	language: LanguageCode,
	limit = 20,
): Promise<Array<typeof reviewCard.$inferSelect & { previewIntervals: Record<string, string> }>> {
	const now = new Date();

	const cards = await db
		.select()
		.from(reviewCard)
		.where(and(eq(reviewCard.userId, userId), eq(reviewCard.language, language)))
		.orderBy(asc(reviewCard.id))
		.limit(limit);

	const dueCards = cards.filter((c) => {
		const card = deserializeCard(c.fsrsCard);
		return card.due <= now;
	});

	if (dueCards.length === 0) {
		return [];
	}

	const scheduler = getScheduler();

	return dueCards.map((c) => {
		const card = deserializeCard(c.fsrsCard);
		const preview = scheduler.repeat(card, now);

		const formatInterval = (dueDate: Date): string => {
			const diffMs = dueDate.getTime() - now.getTime();
			const diffMins = Math.round(diffMs / 60000);
			if (diffMins < 60) return `${diffMins}m`;
			const diffHours = Math.round(diffMins / 60);
			if (diffHours < 24) return `${diffHours}h`;
			const diffDays = Math.round(diffHours / 24);
			if (diffDays < 30) return `${diffDays}d`;
			const diffMonths = Math.round(diffDays / 30);
			return `${diffMonths}mo`;
		};

		return {
			...c,
			previewIntervals: {
				again: formatInterval(preview[Rating.Again].card.due),
				hard: formatInterval(preview[Rating.Hard].card.due),
				good: formatInterval(preview[Rating.Good].card.due),
				easy: formatInterval(preview[Rating.Easy].card.due),
			},
		};
	});
}

// ── rateCard ─────────────────────────────────────────────────────────

export async function rateCard(
	cardId: number,
	userId: string,
	rating: 1 | 2 | 3 | 4,
	elapsedSeconds: number,
): Promise<{ card: Record<string, unknown>; nextDue: string }> {
	const cardRow = await db.query.reviewCard.findFirst({
		where: and(eq(reviewCard.id, cardId), eq(reviewCard.userId, userId)),
	});

	if (!cardRow) throw new Error("Card not found");

	const prevCard = deserializeCard(cardRow.fsrsCard);
	const scheduler = getScheduler();

	const ratingMap: Record<number, Grade> = {
		1: Rating.Again as Grade,
		2: Rating.Hard as Grade,
		3: Rating.Good as Grade,
		4: Rating.Easy as Grade,
	};

	const now = new Date();
	const result = scheduler.next(prevCard, now, ratingMap[rating]);

	const newCardSerialized = serializeCard(result.card);
	const logSerialized = serializeLog(result.log);

	await db.update(reviewCard).set({ fsrsCard: newCardSerialized }).where(eq(reviewCard.id, cardId));

	await db.insert(reviewLog).values({
		cardId,
		userId,
		rating,
		elapsedSeconds,
		scheduledDays: result.log.scheduled_days,
		prevCard: serializeCard(prevCard),
		newCard: newCardSerialized,
		log: logSerialized,
	});

	return {
		card: newCardSerialized,
		nextDue: result.card.due instanceof Date ? result.card.due.toISOString() : String(result.card.due),
	};
}

// ── getReviewStats ───────────────────────────────────────────────────

export async function getReviewStats(userId: string, language: LanguageCode) {
	const now = new Date();

	const allCards = await db
		.select({ fsrsCard: reviewCard.fsrsCard })
		.from(reviewCard)
		.where(and(eq(reviewCard.userId, userId), eq(reviewCard.language, language)));

	const [reviewedToday] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(reviewLog)
		.where(
			and(
				eq(reviewLog.userId, userId),
				lte(reviewLog.reviewedAt, now),
				sql`${reviewLog.reviewedAt} >= ${new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()}`,
			),
		);

	const totalCards = allCards.length;

	let newCount = 0;
	let learningCount = 0;
	let reviewCount = 0;
	let dueToday = 0;

	for (const c of allCards) {
		const card = deserializeCard(c.fsrsCard);
		if (card.state === 0)
			newCount++; // State.New
		else if (card.state === 1)
			learningCount++; // State.Learning
		else if (card.state === 3)
			learningCount++; // State.Relearning (treat as learning)
		else reviewCount++;

		if (card.due <= now) dueToday++;
	}

	// Count notes without review cards (for archive "create card" availability)
	const [pendingCount] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(note)
		.leftJoin(reviewCard, eq(note.id, reviewCard.sourceNoteId))
		.where(and(eq(note.userId, userId), isNull(reviewCard.id)));

	return {
		dueToday,
		totalCards,
		newCount,
		learningCount,
		reviewCount,
		reviewedToday: reviewedToday?.count ?? 0,
		pendingNotes: pendingCount?.count ?? 0,
	};
}
