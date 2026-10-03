export interface AttemptCandidate {
	id: number;
	lineupId: number | null;
	/** Terminal: finished, or stopped for good. */
	finished: boolean;
}

/** Where a task request stands: the lineup new attempts join, and whether the URL pinned it. */
export interface AttemptContext {
	lineupId: number | null;
	pinned: boolean;
	/** `?attempt=`: one finished attempt among several in the same lineup (translation retakes). */
	attemptId?: number | null;
}

/**
 * Which of a learner's attempts at one task a task URL shows. Candidates are newest first.
 *
 * A pinned lineup (an Archive link) shows exactly that lineup's attempt. Otherwise unfinished work
 * wins wherever it was started, and then the attempt belongs to the context lineup: a task lined
 * up again is `ready` in its new lineup even though an earlier lineup holds a finished attempt.
 * Outside any lineup the latest attempt is shown.
 */
export function pickShownAttempt<T extends AttemptCandidate>(candidates: T[], context: AttemptContext): T | null {
	// Candidates are the learner's own attempts at this task, so a matching id is an owned attempt.
	const exact = context.attemptId ? candidates.find((candidate) => candidate.id === context.attemptId) : undefined;
	if (exact) return exact;
	const inContext = () => candidates.find((candidate) => candidate.lineupId === context.lineupId) ?? null;
	if (context.pinned) return inContext();
	const unfinished = candidates.find((candidate) => !candidate.finished);
	if (unfinished) return unfinished;
	return context.lineupId === null ? (candidates[0] ?? null) : inContext();
}

const ID = /^[1-9]\d*$/;

/**
 * The pin of a task URL (`?lineup=` and an Archive entry's `attempt=`), carried across the task's
 * own pages so they keep showing the attempt it was opened on. Without `attempt`, only the lineup
 * is kept: after starting over, the new attempt is the one to show. Empty when the URL is not pinned.
 */
export function pinQuery(url: URL, options: { attempt?: boolean } = {}): string {
	const params = new URLSearchParams();
	const lineupId = url.searchParams.get("lineup");
	const attemptId = url.searchParams.get("attempt");
	if (lineupId && ID.test(lineupId)) params.set("lineup", lineupId);
	if (options.attempt !== false && attemptId && ID.test(attemptId)) params.set("attempt", attemptId);
	const query = params.toString();
	return query ? `?${query}` : "";
}

/** A form action URL query (`?/name`) that keeps a task URL's pin. */
export function pinnedActionQuery(pin: string, action: string): string {
	return pin ? `${pin}&/${action}` : `?/${action}`;
}

/** Parses the `?attempt=` pin of a task URL. */
export function requestedAttemptId(url: URL): number | null {
	const attemptId = url.searchParams.get("attempt");
	return attemptId && ID.test(attemptId) ? Number(attemptId) : null;
}
