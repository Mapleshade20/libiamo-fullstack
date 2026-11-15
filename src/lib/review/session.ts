import type { Outcome } from "#lib/notebook/types.ts";
import type { QueueKind, RatingName } from "./types.ts";

/*
 * One review sitting, Anki-style: new and review cards in a main queue; a card the rating keeps within minutes comes back
 * in the same sitting as a learning card. Due learning cards go first; when the main queue runs out, learning cards still
 * waiting are shown early (learn ahead). What each rating does comes from the scheduler (server/review/scheduler.ts) with
 * the card, so the page moves on at once; the server's answer to the rating says what the next ratings do.
 */
export type { RatingName as Rating } from "./types.ts";
export { RATINGS } from "./types.ts";
export type Card = { queue: QueueKind; outcomes: Record<RatingName, Outcome>; dueIn?: number };
export type Item<C extends Card> = { card: C; queue: QueueKind; due: number; outcomes: Record<RatingName, Outcome>; ratings: RatingName[] };

export function createSitting<C extends Card>(cards: C[], now = () => Date.now()) {
	const t0 = now();
	const all: Item<C>[] = cards.map((card) => ({ card, queue: card.queue, due: t0 + (card.dueIn ?? 0), outcomes: card.outcomes, ratings: [] }));
	const main = all.filter((i) => i.queue !== "learning");
	const learning = all.filter((i) => i.queue === "learning");
	const done: Item<C>[] = [];
	const pending = new Set<Item<C>>();
	const next = (): Item<C> | undefined => {
		learning.sort((a, b) => a.due - b.due);
		const ready = learning.find((i) => !pending.has(i));
		if (ready && ready.due <= now()) return ready;
		return main[0] ?? ready;
	};
	let current = next();
	return {
		get current() {
			return current;
		},
		get waiting() {
			return pending.size;
		},
		get done() {
			return done;
		},
		counts() {
			return {
				new: main.filter((i) => i.queue === "new").length,
				learning: learning.length,
				review: main.filter((i) => i.queue === "review").length,
			};
		},
		/** The buttons' labels for the card shown. */
		intervals: (i: Item<C>) => (["again", "hard", "good", "easy"] as const).map((r) => i.outcomes[r].label),
		/** Rates the card shown and moves on; returns it (its rating is sent with it). */
		rate(r: RatingName, awaiting = false) {
			const it = current;
			if (!it) return;
			const o = it.outcomes[r];
			it.ratings.push(r);
			for (const list of [main, learning]) {
				const at = list.indexOf(it);
				if (at >= 0) list.splice(at, 1);
			}
			if (o.stays) {
				it.queue = "learning";
				it.due = now() + o.inMs;
				learning.push(it);
			} else done.push(it);
			if (awaiting) pending.add(it);
			current = next();
			return it;
		},
		/** The server's word on a rated card: where it is, and what rating it next does. */
		settle(it: Item<C>, s: { queue: QueueKind; outcomes: Record<RatingName, Outcome> }) {
			it.outcomes = s.outcomes;
			pending.delete(it);
			for (const list of [main, learning, done]) {
				const at = list.indexOf(it);
				if (at >= 0) list.splice(at, 1);
			}
			it.queue = s.queue;
			if (s.queue === "learning") learning.push(it);
			else done.push(it);
			if (!current || current === it) current = next();
		},
	};
}
