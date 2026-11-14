import type { ScenarioCard } from "#lib/scenario/types.ts";

/*
 * "For you", by code and never by a calendar: what the learner has not written yet first; within that, places take
 * turns, so two of the same place never lead; newer first.
 */
export function rank<C extends Pick<ScenarioCard, "place" | "state" | "publishedAt">>(list: C[]): C[] {
	const done = (c: C) => (c.state === "written" ? 1 : 0);
	const left = [...list].sort((a, b) => done(a) - done(b) || b.publishedAt - a.publishedAt);
	const out: C[] = [];
	while (left.length) {
		const last = out.at(-1)?.place;
		const at = left.findIndex((c) => c.place !== last && done(c) === done(left[0]));
		out.push(left.splice(Math.max(at, 0), 1)[0]);
	}
	return out;
}

/** An issue stands for about a month: the latest one published is current while it is recent. */
export const ISSUE_DAYS = 30;
export function isCurrent(date: string, now = new Date()) {
	const t = Date.parse(`${date}T12:00:00Z`);
	return t <= now.getTime() && now.getTime() - t < ISSUE_DAYS * 86_400_000;
}

/** The shelf's prompts: the current issue's first not yet written, then the pool's not yet started, in rank order. */
export function shelfOf<C extends Pick<ScenarioCard, "place" | "state" | "publishedAt">>(issue: C[], pool: C[], n = 2): C[] {
	const fromIssue = rank(issue).filter((c) => c.state !== "written");
	return [...fromIssue.slice(0, 1), ...rank(pool).filter((c) => c.state === "new")].slice(0, n);
}
