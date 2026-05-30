/**
 * Thin wrapper around ts-fsrs that handles:
 * - Shared scheduler instance creation
 * - Card ↔ plain object serialization (for JSONB storage)
 * - ReviewLog ↔ plain object serialization
 */

import type { Card, ReviewLog } from "ts-fsrs";
import { createEmptyCard, fsrs, Rating, State } from "ts-fsrs";

// ── Scheduler singleton ────────────────────────────────────────────

let _scheduler: ReturnType<typeof fsrs> | null = null;

export function getScheduler() {
	if (!_scheduler) {
		_scheduler = fsrs({
			request_retention: 0.9,
			maximum_interval: 365,
			enable_fuzz: true,
			enable_short_term: true,
		});
	}
	return _scheduler;
}

// ── Card serialization ─────────────────────────────────────────────

/**
 * Convert a ts-fsrs Card to a plain object safe for JSONB storage.
 * Dates are converted to ISO strings.
 */
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

/**
 * Revive a plain object (from JSONB) back into a ts-fsrs Card.
 * ISO date strings are converted back to Date objects.
 */
export function deserializeCard(data: unknown): Card {
	if (!data || typeof data !== "object") {
		return createEmptyCard();
	}

	const obj = data as Record<string, unknown>;

	const parseDate = (v: unknown): Date | undefined => {
		if (!v) return undefined;
		if (v instanceof Date) return v;
		if (typeof v === "string" || typeof v === "number") {
			const d = new Date(v);
			return Number.isNaN(d.getTime()) ? undefined : d;
		}
		return undefined;
	};

	return {
		due: parseDate(obj.due) ?? new Date(),
		stability: typeof obj.stability === "number" ? obj.stability : 0,
		difficulty: typeof obj.difficulty === "number" ? obj.difficulty : 0,
		elapsed_days: typeof obj.elapsed_days === "number" ? obj.elapsed_days : 0,
		scheduled_days: typeof obj.scheduled_days === "number" ? obj.scheduled_days : 0,
		learning_steps: typeof obj.learning_steps === "number" ? (obj.learning_steps as number) : 0,
		reps: typeof obj.reps === "number" ? obj.reps : 0,
		lapses: typeof obj.lapses === "number" ? obj.lapses : 0,
		state: typeof obj.state === "number" ? (obj.state as Card["state"]) : State.New,
		last_review: parseDate(obj.last_review),
	};
}

// ── ReviewLog serialization ────────────────────────────────────────

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

// ── Convenience ─────────────────────────────────────────────────────

/**
 * Create a brand-new card with the default empty FSRS state.
 */
export function createNewCard() {
	return createEmptyCard();
}

/** Type alias to match ts-fsrs Rating values */
export { Rating, State };
