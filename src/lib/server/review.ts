import { and, asc, eq, lte, sql } from "drizzle-orm";
import type { Card, Grade, ReviewLog } from "ts-fsrs";
import { createEmptyCard, fsrs, Rating, State } from "ts-fsrs";
import type { LanguageCode } from "$lib/constants";
import { parseNoteExamples, randomExampleIndex } from "$lib/note";
import type { StudyQueueKind } from "$lib/review";
import { db } from "./db";
import { note, reviewLog } from "./db/schema";

let scheduler: ReturnType<typeof fsrs> | null = null;

export function getScheduler() {
	if (!scheduler) {
		scheduler = fsrs({ request_retention: 0.9, maximum_interval: 365, enable_fuzz: true, enable_short_term: true });
	}
	return scheduler;
}

export function serializeCard(card: Card): Record<string, unknown> {
	return {
		due: card.due instanceof Date ? card.due.toISOString() : card.due,
		stability: card.stability,
		difficulty: card.difficulty,
		elapsed_days: card.elapsed_days,
		scheduled_days: card.scheduled_days,
		learning_steps: card.learning_steps,
		reps: card.reps,
		lapses: card.lapses,
		state: card.state,
		last_review: card.last_review ? (card.last_review instanceof Date ? card.last_review.toISOString() : card.last_review) : null,
	};
}

export function deserializeCard(data: unknown): Card {
	if (!data || typeof data !== "object") return createEmptyCard();
	const object = data as Record<string, unknown>;
	const parseDate = (value: unknown): Date | undefined => {
		if (value instanceof Date) return value;
		if (typeof value !== "string" && typeof value !== "number") return undefined;
		const parsed = new Date(value);
		return Number.isNaN(parsed.getTime()) ? undefined : parsed;
	};
	return {
		due: parseDate(object.due) ?? new Date(),
		stability: typeof object.stability === "number" ? object.stability : 0,
		difficulty: typeof object.difficulty === "number" ? object.difficulty : 0,
		elapsed_days: typeof object.elapsed_days === "number" ? object.elapsed_days : 0,
		scheduled_days: typeof object.scheduled_days === "number" ? object.scheduled_days : 0,
		learning_steps: typeof object.learning_steps === "number" ? object.learning_steps : 0,
		reps: typeof object.reps === "number" ? object.reps : 0,
		lapses: typeof object.lapses === "number" ? object.lapses : 0,
		state: typeof object.state === "number" ? (object.state as Card["state"]) : State.New,
		last_review: parseDate(object.last_review),
	};
}

export function serializeLog(log: ReviewLog): Record<string, unknown> {
	return {
		rating: log.rating,
		state: log.state,
		due: log.due instanceof Date ? log.due.toISOString() : log.due,
		stability: log.stability,
		difficulty: log.difficulty,
		elapsed_days: log.elapsed_days,
		last_elapsed_days: log.last_elapsed_days,
		scheduled_days: log.scheduled_days,
		learning_steps: log.learning_steps,
		review: log.review instanceof Date ? log.review.toISOString() : log.review,
	};
}

export function createNewCard() {
	return createEmptyCard();
}

export { Rating, State };

export function studyQueueKind(cardData: unknown): StudyQueueKind {
	const state = deserializeCard(cardData).state;
	if (state === State.New) return "new";
	if (state === State.Learning || state === State.Relearning) return "learning";
	return "review";
}

function formatInterval(dueDate: Date, now: Date): string {
	const exactMinutes = (dueDate.getTime() - now.getTime()) / 60_000;
	if (exactMinutes < 1) return "<1m";
	const minutes = Math.round(exactMinutes);
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `${hours}h`;
	const days = Math.round(hours / 24);
	if (days < 30) return `${days}d`;
	return `${Math.round(days / 30)}mo`;
}

function previewIntervals(card: Card, now: Date) {
	const preview = getScheduler().repeat(card, now);
	return {
		again: formatInterval(preview[Rating.Again].card.due, now),
		hard: formatInterval(preview[Rating.Hard].card.due, now),
		good: formatInterval(preview[Rating.Good].card.due, now),
		easy: formatInterval(preview[Rating.Easy].card.due, now),
	};
}

export async function getDueNotes(userId: string, language: LanguageCode, limit = 20, random = Math.random) {
	const now = new Date();
	const rows = await db
		.select()
		.from(note)
		.where(and(eq(note.userId, userId), eq(note.language, language), sql`(${note.fsrsCard}->>'due')::timestamptz <= ${now.toISOString()}`))
		.orderBy(asc(note.id))
		.limit(limit);

	return rows.map((row) => {
		const examples = parseNoteExamples(row.examples);
		const exampleIndex = randomExampleIndex(examples, random);
		const example = examples[exampleIndex];
		const card = deserializeCard(row.fsrsCard);
		return {
			...row,
			exampleIndex,
			nativeText: example.nativeText,
			targetText: example.targetText,
			queueKind: studyQueueKind(row.fsrsCard),
			previewIntervals: previewIntervals(card, now),
		};
	});
}

export async function rateNote(noteId: number, userId: string, rating: 1 | 2 | 3 | 4, elapsedSeconds: number, random = Math.random) {
	const ratingMap: Record<number, Grade> = {
		1: Rating.Again as Grade,
		2: Rating.Hard as Grade,
		3: Rating.Good as Grade,
		4: Rating.Easy as Grade,
	};
	if (!ratingMap[rating]) throw new Error("Invalid review rating.");
	if (!Number.isInteger(elapsedSeconds) || elapsedSeconds < 0) throw new Error("Invalid review duration.");
	return db.transaction(async (tx) => {
		const [row] = await tx
			.select()
			.from(note)
			.where(and(eq(note.id, noteId), eq(note.userId, userId)))
			.limit(1)
			.for("update");
		if (!row) throw new Error("Note not found");
		const previous = deserializeCard(row.fsrsCard);
		const now = new Date();
		const result = getScheduler().next(previous, now, ratingMap[rating]);
		const serialized = serializeCard(result.card);
		await tx.update(note).set({ fsrsCard: serialized, updatedAt: now }).where(eq(note.id, noteId));
		await tx.insert(reviewLog).values({
			noteId,
			userId,
			rating,
			elapsedSeconds,
			scheduledDays: result.log.scheduled_days,
			prevCard: serializeCard(previous),
			newCard: serialized,
			log: serializeLog(result.log),
		});
		const examples = parseNoteExamples(row.examples);
		const example = examples[randomExampleIndex(examples, random)];
		return {
			card: serialized,
			nextDue: result.card.due.toISOString(),
			queueKind: studyQueueKind(result.card),
			previewIntervals: previewIntervals(result.card, now),
			nativeText: example.nativeText,
			targetText: example.targetText,
		};
	});
}

export async function getReviewStats(userId: string, language: LanguageCode) {
	const now = new Date();
	const notes = await db
		.select({ fsrsCard: note.fsrsCard })
		.from(note)
		.where(and(eq(note.userId, userId), eq(note.language, language)));
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
	let newCount = 0;
	let learningCount = 0;
	let reviewCount = 0;
	let dueToday = 0;
	for (const row of notes) {
		const card = deserializeCard(row.fsrsCard);
		if (card.state === State.New) newCount++;
		else if (card.state === State.Learning || card.state === State.Relearning) learningCount++;
		else reviewCount++;
		if (card.due <= now) dueToday++;
	}
	return {
		dueToday,
		totalCards: notes.length,
		newCount,
		learningCount,
		reviewCount,
		reviewedToday: reviewedToday?.count ?? 0,
		pendingNotes: 0,
	};
}
