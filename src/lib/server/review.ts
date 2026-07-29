import { and, asc, eq, lte, sql } from "drizzle-orm";
import type { Card, Grade, ReviewLog, TLearningStepsStrategy } from "ts-fsrs";
import { BasicLearningStepsStrategy, ConvertStepUnitToMinutes, createEmptyCard, fsrs, Rating, State, StrategyMode } from "ts-fsrs";
import { type LanguageCode, REVIEW_MAXIMUM_INTERVAL_DAYS } from "$lib/constants";
import { parseNoteExamples, randomExampleIndex } from "$lib/note";
import type { StudyQueueKind } from "$lib/review";
import { db } from "./db";
import { note, reviewLog } from "./db/schema";

let scheduler: ReturnType<typeof fsrs> | null = null;

export const ANKI_LEARN_AHEAD_MINUTES = 20;
export const ANKI_MAXIMUM_INTERVAL_DAYS = REVIEW_MAXIMUM_INTERVAL_DAYS;
const ANKI_LEARNING_STEPS = ["1m", "10m"] as const;
const ANKI_RELEARNING_STEPS = ["10m"] as const;

const ankiLearningStepsStrategy: TLearningStepsStrategy = (params, state, currentStep) => {
	const result = BasicLearningStepsStrategy(params, state, currentStep);
	if ((state === State.Learning || state === State.Relearning) && currentStep > 0) {
		const steps = state === State.Relearning ? params.relearning_steps : params.learning_steps;
		const current = steps[currentStep];
		if (current && result[Rating.Hard]) {
			result[Rating.Hard] = {
				scheduled_minutes: ConvertStepUnitToMinutes(current),
				next_step: currentStep,
			};
		}
	}
	return result;
};

export function getScheduler() {
	if (!scheduler) {
		scheduler = fsrs({
			request_retention: 0.9,
			maximum_interval: ANKI_MAXIMUM_INTERVAL_DAYS,
			enable_fuzz: true,
			enable_short_term: true,
			learning_steps: [...ANKI_LEARNING_STEPS],
			relearning_steps: [...ANKI_RELEARNING_STEPS],
		}).useStrategy(StrategyMode.LEARNING_STEPS, ankiLearningStepsStrategy);
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
	const exactSeconds = Math.max(0, Math.round((dueDate.getTime() - now.getTime()) / 1000));
	let formatted: string;
	if (exactSeconds < 60) formatted = `${exactSeconds}s`;
	else {
		const minutes = Math.round(exactSeconds / 60);
		if (minutes < 60) formatted = `${minutes}m`;
		else {
			const hours = Math.round(minutes / 60);
			if (hours < 24) formatted = `${hours}h`;
			else {
				const days = Math.round(hours / 24);
				formatted = days < 30 ? `${days}d` : `${Math.round(days / 30)}mo`;
			}
		}
	}
	return exactSeconds > 0 && exactSeconds < ANKI_LEARN_AHEAD_MINUTES * 60 ? `<${formatted}` : formatted;
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

export function isReviewCardAvailable(cardData: unknown, now: Date): boolean {
	const card = deserializeCard(cardData);
	if (card.due <= now) return true;
	if (card.state !== State.Learning && card.state !== State.Relearning) return false;
	return card.due.getTime() <= now.getTime() + ANKI_LEARN_AHEAD_MINUTES * 60_000;
}

export class ReviewCardNotDueError extends Error {
	constructor() {
		super("Note is not due for review");
		this.name = "ReviewCardNotDueError";
	}
}

export async function getDueNotes(userId: string, language: LanguageCode, limit = 20, random = Math.random, now = new Date()) {
	const nowIso = now.toISOString();
	const learnAheadIso = new Date(now.getTime() + ANKI_LEARN_AHEAD_MINUTES * 60_000).toISOString();
	const rows = await db
		.select()
		.from(note)
		.where(
			and(
				eq(note.userId, userId),
				eq(note.language, language),
				sql`(
					(${note.fsrsCard}->>'due')::timestamptz <= ${nowIso}
					OR (
						(${note.fsrsCard}->>'state')::int IN (${State.Learning}, ${State.Relearning})
						AND (${note.fsrsCard}->>'due')::timestamptz <= ${learnAheadIso}
					)
				)`,
			),
		)
		.orderBy(
			sql`CASE
				WHEN (${note.fsrsCard}->>'state')::int IN (${State.Learning}, ${State.Relearning})
					AND (${note.fsrsCard}->>'due')::timestamptz <= ${nowIso} THEN 0
				WHEN (${note.fsrsCard}->>'due')::timestamptz <= ${nowIso} THEN 1
				ELSE 2
			END`,
			sql`CASE
				WHEN (${note.fsrsCard}->>'state')::int IN (${State.Learning}, ${State.Relearning})
				THEN (${note.fsrsCard}->>'due')::timestamptz
			END`,
			asc(note.id),
		)
		.limit(limit);

	return rows.map((row) => {
		const examples = parseNoteExamples(row.examples);
		const exampleIndex = randomExampleIndex(examples, random);
		const example = examples[exampleIndex];
		const card = deserializeCard(row.fsrsCard);
		return {
			...row,
			due: card.due.toISOString(),
			exampleIndex,
			nativeText: example.nativeText,
			targetText: example.targetText,
			queueKind: studyQueueKind(row.fsrsCard),
			previewIntervals: previewIntervals(card, now),
		};
	});
}

export async function rateNote(
	noteId: number,
	userId: string,
	rating: 1 | 2 | 3 | 4,
	elapsedSeconds: number,
	random = Math.random,
	now = new Date(),
) {
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
		if (!isReviewCardAvailable(previous, now)) throw new ReviewCardNotDueError();
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

async function getOwnedNoteForScheduling(transaction: Pick<typeof db, "select">, noteId: number, userId: string) {
	const [row] = await transaction
		.select()
		.from(note)
		.where(and(eq(note.id, noteId), eq(note.userId, userId)))
		.limit(1)
		.for("update");
	return row;
}

export async function setNoteDueInDays(noteId: number, userId: string, days: number, now = new Date()) {
	if (!Number.isInteger(days) || days < 0 || days > ANKI_MAXIMUM_INTERVAL_DAYS) throw new Error("Invalid due-day offset.");
	return db.transaction(async (transaction) => {
		const row = await getOwnedNoteForScheduling(transaction, noteId, userId);
		if (!row) return undefined;
		const card = deserializeCard(row.fsrsCard);
		card.due = new Date(now.getTime() + days * 86_400_000);
		const fsrsCard = serializeCard(card);
		const [updated] = await transaction
			.update(note)
			.set({ fsrsCard, updatedAt: now })
			.where(and(eq(note.id, noteId), eq(note.userId, userId)))
			.returning();
		return updated ? { due: card.due.toISOString(), queueKind: studyQueueKind(card) } : undefined;
	});
}

export async function resetNoteScheduling(noteId: number, userId: string, now = new Date()) {
	return db.transaction(async (transaction) => {
		const row = await getOwnedNoteForScheduling(transaction, noteId, userId);
		if (!row) return undefined;
		const card = createNewCard();
		card.due = now;
		const fsrsCard = serializeCard(card);
		const [updated] = await transaction
			.update(note)
			.set({ fsrsCard, updatedAt: now })
			.where(and(eq(note.id, noteId), eq(note.userId, userId)))
			.returning();
		if (!updated) return undefined;
		await transaction.delete(reviewLog).where(and(eq(reviewLog.noteId, noteId), eq(reviewLog.userId, userId)));
		return { due: card.due.toISOString(), queueKind: studyQueueKind(card), reps: card.reps, lapses: card.lapses };
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
		if (isReviewCardAvailable(card, now)) dueToday++;
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
