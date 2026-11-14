/*
 * One review sitting, Anki-style: new and review cards in a main queue; a card rated within minutes comes back in the
 * same sitting as a learning card. Due learning cards go first; when the main queue runs out, learning cards still
 * waiting are shown early (learn ahead). Graduated and reviewed cards leave the sitting.
 */
export type Rating = "again" | "hard" | "good" | "easy";
export type CardState = "new" | "learning" | "review";
export const RATINGS: Rating[] = ["again", "hard", "good", "easy"];
type Step = { label: string; minutes?: number };
export type Item<C> = { card: C; state: CardState; step: number; due: number; ratings: Rating[] };

const M = 60_000;
/** What each rating does from each state: back in N minutes (stays in the sitting), or a day count (leaves it). */
const PLAN: Record<string, Record<Rating, Step>> = {
	"new-0": { again: { label: "1m", minutes: 1 }, hard: { label: "6m", minutes: 6 }, good: { label: "10m", minutes: 10 }, easy: { label: "4d" } },
	"learning-0": { again: { label: "1m", minutes: 1 }, hard: { label: "6m", minutes: 6 }, good: { label: "10m", minutes: 10 }, easy: { label: "4d" } },
	"learning-1": { again: { label: "1m", minutes: 1 }, hard: { label: "10m", minutes: 10 }, good: { label: "1d" }, easy: { label: "4d" } },
	review: { again: { label: "10m", minutes: 10 }, hard: { label: "2d" }, good: { label: "5d" }, easy: { label: "9d" } },
};
const plan = (i: { state: CardState; step: number }) => PLAN[i.state === "review" ? "review" : `${i.state}-${i.state === "new" ? 0 : i.step}`];
export const intervals = (i: { state: CardState; step: number }) => RATINGS.map((r) => plan(i)[r].label);

export function createSitting<C>(cards: { card: C; state: "new" | "review" }[], now = () => Date.now()) {
	const main: Item<C>[] = cards.map((c) => ({ ...c, step: 0, due: 0, ratings: [] }));
	const learning: Item<C>[] = [];
	const done: Item<C>[] = [];
	const next = (): Item<C> | undefined => {
		const t = now();
		learning.sort((a, b) => a.due - b.due);
		if (learning[0] && learning[0].due <= t) return learning[0];
		return main[0] ?? learning[0];
	};
	let current = next();
	return {
		get current() {
			return current;
		},
		get done() {
			return done;
		},
		counts() {
			return {
				new: main.filter((i) => i.state === "new").length,
				learning: learning.length,
				review: main.filter((i) => i.state === "review").length,
			};
		},
		rate(r: Rating) {
			const it = current;
			if (!it) return;
			const step = plan(it)[r];
			it.ratings.push(r);
			for (const list of [main, learning]) {
				const at = list.indexOf(it);
				if (at >= 0) list.splice(at, 1);
			}
			if (step.minutes) {
				// Again starts the steps over; Good moves one step on; Hard repeats the step.
				it.step = r === "again" ? 0 : r === "good" ? it.step + 1 : it.step;
				if (it.state === "review") it.step = 1;
				it.state = "learning";
				it.due = now() + step.minutes * M;
				learning.push(it);
			} else done.push(it);
			current = next();
		},
	};
}
