/* The learner's week as the pages see it (server/week/days.ts). Days are `YYYY-MM-DD` in the learner's time zone. */

/** full: both halves, which is what counts; learned or reviewed: one half; later: not come yet. */
export type DayKind = "full" | "learned" | "reviewed" | "none" | "later";
export type WeekView = { today: string; goal: number; days: { day: string; kind: DayKind }[] };
export type HistoryWeek = { start: string; goal: number; days: DayKind[] };
