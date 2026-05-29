/**
 * Review card generation and CRUD operations.
 *
 * - generateCardsFromNotes: LLM-powered card creation from saved notes
 * - getDueCards: fetch cards due for review
 * - rateCard: apply a review rating and persist the updated FSRS state
 * - getReviewStats: aggregate review statistics
 */

import { and, asc, eq, lte, sql } from "drizzle-orm";
import type { Grade } from "ts-fsrs";
import { z } from "zod";
import { getLanguageEnglishName, type LanguageCode } from "$lib/constants";
import { db } from "./db";
import { note, reviewCard, reviewLog } from "./db/schema";
import { createNewCard, deserializeCard, getScheduler, Rating, serializeCard, serializeLog } from "./fsrs-scheduler";
import { chatJson } from "./llm";

// ── Card generation schema (LLM output) ────────────────────────────

const CardGenerationSchema = z.object({
	cards: z.array(
		z.object({
			noteId: z.number().describe("The id of the note this card is generated from"),
			cardType: z.enum(["vocabulary", "expression", "grammar", "correction"]),
			front: z.string().describe("Question side: word/phrase/cloze/sentence in the learning language"),
			back: z.string().describe("Answer side: definition/explanation/rule in English"),
			context: z.string().optional().describe("Original context or example sentence (optional)"),
			shouldSkip: z.boolean().optional().describe("Set true if this note does not contain a concrete language point worth making a flashcard for"),
		}),
	),
});

// ── generateCardsFromNotes ─────────────────────────────────────────

export async function generateCardsFromNotes(userId: string, language?: string): Promise<{ generated: number; skipped: number }> {
	const conditions = [eq(note.userId, userId), eq(note.reviewStatus, "pending")];

	const pendingNotes = await db
		.select({
			id: note.id,
			tutorComment: note.tutorComment,
			keywords: note.keywords,
			sourceContext: note.sourceContext,
		})
		.from(note)
		.where(and(...conditions))
		.orderBy(asc(note.id))
		.limit(30); // process up to 30 notes per batch

	if (pendingNotes.length === 0) {
		return { generated: 0, skipped: 0 };
	}

	// Determine language: use provided language or infer from associated session
	const firstSession = pendingNotes[0]?.id
		? await db.query.note.findFirst({
				where: eq(note.id, pendingNotes[0].id),
				with: {
					sourceSession: {
						columns: {},
						with: {
							task: { columns: { language: true } },
						},
					},
				},
			})
		: null;

	const detectedLanguage = (language ?? firstSession?.sourceSession?.task?.language ?? "en") as LanguageCode;
	const languageName = getLanguageEnglishName(detectedLanguage);

	const result = await chatJson(CardGenerationSchema, {
		messages: [
			{
				role: "system",
				content: `You are an expert ${languageName} language tutor creating review flashcards from saved notes.

For each note, determine the best flashcard type and create content:

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
- Each card's front MUST contain ${languageName} text. The back should explain in English.
- Prefer cloze deletions for expression cards — they promote active recall.
- For correction cards, clearly show the WRONG → RIGHT contrast.
- Do NOT create duplicate cards for very similar notes. Merge similar points into one good card.
- Return JSON: { "cards": [{ "noteId": ..., "cardType": "...", "front": "...", "back": "...", "context": "...", "shouldSkip": false }] }`,
			},
			{
				role: "user",
				content: `Generate review cards for these saved notes:\n\n${pendingNotes
					.map(
						(n) =>
							`## Note ${n.id}\n**Lesson:** ${n.tutorComment}\n${n.keywords?.length ? `**Keywords:** ${n.keywords.join(", ")}\n` : ""}${n.sourceContext ? `**Context:** ${n.sourceContext}` : ""}`,
					)
					.join("\n\n")}`,
			},
		],
		userId,
	});

	let generated = 0;
	let skipped = 0;

	const newCard = createNewCard();

	for (const card of result.cards) {
		const noteId = card.noteId;

		if (card.shouldSkip) {
			await db.update(note).set({ reviewStatus: "skipped" }).where(eq(note.id, noteId));
			skipped++;
			continue;
		}

		await db.insert(reviewCard).values({
			userId,
			sourceNoteId: noteId,
			language: detectedLanguage,
			cardType: card.cardType,
			front: card.front,
			back: card.back,
			context: card.context ?? null,
			fsrsCard: serializeCard(newCard),
		});

		await db.update(note).set({ reviewStatus: "generated" }).where(eq(note.id, noteId));
		generated++;
	}

	return { generated, skipped };
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

	// Filter cards where due date is in the past or new/learning cards
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

		// Format intervals as human-readable strings
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
				// Same day check: reviewedAt >= start of today
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

	// Also check for pending notes
	const [pendingCount] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(note)
		.where(and(eq(note.userId, userId), eq(note.reviewStatus, "pending")));

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
