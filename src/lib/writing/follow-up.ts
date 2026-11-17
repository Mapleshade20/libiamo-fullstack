import type { FollowUp, PieceItem } from "./types.ts";

/*
 * The shelf's follow-up (types.ts `FollowUp`), from the newest piece of each kind that is due one: finished and never
 * asked whether it was posted, or answered "not yet" a day ago or more (a scenario's piece was sent in its place
 * already: never asked), and finished three days ago (an hour's grace) without being written again. The server finds
 * those in SQL (server/writing/pieces.ts); the tour's sandbox from its few pieces (`dueOf`).
 */
export const ASK_AGAIN_MS = 86_400_000;
export const WRITE_AGAIN_MS = 3 * 86_400_000 - 3_600_000;

export type Due = { unasked?: PieceItem; notYet?: PieceItem; again?: PieceItem };

/** Whether it was posted comes first; a "not yet" waits behind writing again. */
export function pickFollowUp({ unasked, notYet, again }: Due): FollowUp | undefined {
	const ask = !unasked ? notYet : !notYet || unasked.at >= notYet.at ? unasked : notYet;
	if (ask && ask.posted !== "not-yet") return { kind: "posted", w: ask };
	if (again) return { kind: "again", w: again };
	return ask ? { kind: "posted", w: ask } : undefined;
}

/** The newest piece of each kind that is due, among `pieces` (newest first). */
export function dueOf(pieces: PieceItem[], now: number): Due {
	const done = pieces.filter((w) => w.finishedAt);
	return {
		unasked: done.find((w) => !w.scenarioId && !w.posted),
		notYet: done.find((w) => !w.scenarioId && w.posted === "not-yet" && now - (w.askedAt ?? 0) >= ASK_AGAIN_MS),
		again: done.find((w) => !w.again && now - (w.finishedAt ?? now) >= WRITE_AGAIN_MS),
	};
}
