/* Review's vocabulary, shared by the scheduler (server/review/scheduler.ts) and the sitting (lib/review/session.ts). */
export const RATINGS = ["again", "hard", "good", "easy"] as const;
export type RatingName = (typeof RATINGS)[number];
/** Where a card is in the scheduler: never seen, inside its steps, or graduated. */
export type QueueKind = "new" | "learning" | "review";
