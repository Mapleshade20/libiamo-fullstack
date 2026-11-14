import { DefaultScheduler, type Grade, Rating, State } from "ts-fsrs";
import type { Outcome } from "#lib/notebook/types.ts";
import { type QueueKind, RATINGS, type RatingName } from "#lib/review/types.ts";
import { localDay, startOfLocalDay, startOfNextLocalDay } from "#lib/time/local-day.ts";

/*
 * Review scheduling, Anki's way on FSRS (design §6.5): learning steps of one and ten minutes, relearning of ten, review
 * cards due by the day in the learner's time zone, and learning cards shown up to twenty minutes early (learn ahead).
 * Learn ahead is at least the longest step, so every learning card a sitting makes stays in it: an empty queue means the
 * day's reviews are done, not paused. FSRS-6, not the package's FSRS-7 default: its first intervals are the ones Anki
 * learners know (FSRS-7 sends a first Easy almost two months out), and the model is not overridden inside the steps.
 */
export const LEARN_AHEAD_MS = 20 * 60_000;
export const MAX_INTERVAL_DAYS = 3650;

const scheduler = await DefaultScheduler({
	version: "FSRS-6",
	desiredRetention: 0.9,
	learningSteps: ["1m", "10m"],
	relearningSteps: ["10m"],
	allowModelOverride: false,
	enableFuzz: true,
	maximumInterval: MAX_INTERVAL_DAYS,
});
type Card = ReturnType<typeof scheduler.newCard>;

/** A card as the database keeps it (`note.fsrs`): the scheduler's, its times as ISO strings. */
export type StoredCard = Omit<Card, "dueAt" | "lastReviewAt"> & { dueAt: string; lastReviewAt: string | null };
const GRADE: Record<RatingName, Grade> = { again: Rating.Again, hard: Rating.Hard, good: Rating.Good, easy: Rating.Easy };

const store = (c: Card): StoredCard => ({
	...c,
	dueAt: new Date(c.dueAt).toISOString(),
	lastReviewAt: c.lastReviewAt ? new Date(c.lastReviewAt).toISOString() : null,
});
const load = (s: StoredCard): Card => ({ ...s, dueAt: new Date(s.dueAt), lastReviewAt: s.lastReviewAt ? new Date(s.lastReviewAt) : null }) as Card;

const learning = (state: number) => state === State.Learning || state === State.Relearning;
export const queueKind = (s: StoredCard): QueueKind => (s.state === State.New ? "new" : learning(s.state) ? "learning" : "review");

/** When a card joins the queue: its due time, or earlier by learn ahead for a learning card. */
export const availableAt = (s: StoredCard) => Date.parse(s.dueAt) - (learning(s.state) ? LEARN_AHEAD_MS : 0);

/** A new note's card: due from the learner's next local day. */
export function newCard(now: Date, timeZone: string): StoredCard {
	const c = scheduler.newCard({ now });
	return store({ ...c, dueAt: startOfNextLocalDay(now, timeZone) } as Card);
}

/** How long until a card is asked again, as the rating buttons say it. */
export function intervalLabel(due: Date, now: Date): string {
	const s = Math.max(0, Math.round((due.getTime() - now.getTime()) / 1000));
	const m = Math.round(s / 60);
	const h = Math.round(m / 60);
	const d = Math.round(h / 24);
	return s < 60 ? `${s}s` : m < 60 ? `${m}m` : h < 24 ? `${h}h` : d < 30 ? `${d}d` : d < 365 ? `${Math.round(d / 30)}mo` : `${Math.round(d / 365)}y`;
}

/** What each rating would do: the label its button shows, and whether (and when) the card comes back in this sitting. */
export function preview(s: StoredCard, now: Date): Record<RatingName, Outcome> {
	const card = load(s);
	const out = {} as Record<RatingName, Outcome>;
	for (const r of RATINGS) {
		const next = scheduler.review({ card, grade: GRADE[r], now }).card;
		const due = new Date(next.dueAt);
		out[r] = { label: intervalLabel(due, now), stays: learning(next.state), inMs: due.getTime() - now.getTime() };
	}
	return out;
}

/**
 * A rating. A review card's due time moves to the start of its due day in the learner's time zone, so a cleared queue
 * means the whole day's reviews are done rather than those due before this hour (the due day is fixed when rated: after
 * a change of zone a card may come a few hours off its new midnight once).
 */
export function rate(s: StoredCard, rating: RatingName, now: Date, timeZone: string): StoredCard {
	const next = scheduler.review({ card: load(s), grade: GRADE[rating], now }).card;
	if (next.state === State.Review) next.dueAt = startOfLocalDay(localDay(next.dueAt, timeZone), timeZone);
	return store(next);
}
