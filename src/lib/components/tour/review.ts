import type { Outcome } from "#lib/notebook/types.ts";
import type { RatingName } from "#lib/review/types.ts";

// The demo's recorded review progression, deliberately independent of the live scheduler and learner history.
type Step = { label: string; minutes?: number };
const PLAN: Record<string, Record<RatingName, Step>> = {
	"new-0": { again: { label: "1m", minutes: 1 }, hard: { label: "6m", minutes: 6 }, good: { label: "10m", minutes: 10 }, easy: { label: "4d" } },
	"learning-0": { again: { label: "1m", minutes: 1 }, hard: { label: "6m", minutes: 6 }, good: { label: "10m", minutes: 10 }, easy: { label: "4d" } },
	"learning-1": { again: { label: "1m", minutes: 1 }, hard: { label: "10m", minutes: 10 }, good: { label: "1d" }, easy: { label: "4d" } },
};
export type TourReview = { step: number; queue: "new" | "learning"; done: boolean };
export const freshReview = (): TourReview => ({ step: 0, queue: "new", done: false });
export function tourOutcomes(s: TourReview): Record<RatingName, Outcome> {
	return Object.fromEntries(
		Object.entries(PLAN[`${s.queue}-${s.step}`]).map(([r, v]) => [
			r,
			{ label: v.label, stays: v.minutes !== undefined, inMs: (v.minutes ?? 0) * 60_000 },
		]),
	) as Record<RatingName, Outcome>;
}
export function rateTourReview(s: TourReview, rating: RatingName): TourReview {
	const stays = tourOutcomes(s)[rating].stays;
	return { queue: "learning", step: rating === "again" ? 0 : rating === "good" && stays ? 1 : s.step, done: !stays };
}
