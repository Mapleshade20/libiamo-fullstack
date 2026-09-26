export interface AttemptCandidate {
	lineupId: number | null;
	/** Terminal: finished, or stopped for good. */
	finished: boolean;
}

/** Where a task request stands: the lineup new attempts join, and whether the URL pinned it. */
export interface AttemptContext {
	lineupId: number | null;
	pinned: boolean;
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
	const inContext = () => candidates.find((candidate) => candidate.lineupId === context.lineupId) ?? null;
	if (context.pinned) return inContext();
	const unfinished = candidates.find((candidate) => !candidate.finished);
	if (unfinished) return unfinished;
	return context.lineupId === null ? (candidates[0] ?? null) : inContext();
}

/**
 * The `?lineup=` pin of a task URL, carried across the task's own pages so an attempt opened from
 * the Archive keeps showing that lineup's attempt. Empty when the URL is not pinned.
 */
export function lineupQuery(url: URL): string {
	const lineupId = url.searchParams.get("lineup");
	return lineupId && /^[1-9]\d*$/.test(lineupId) ? `?lineup=${lineupId}` : "";
}
