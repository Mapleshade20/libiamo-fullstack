import { read, write } from "./app.svelte";

/* How the demo runs (not the learner's choices, which are on the settings page): which models it calls, whether it
   reads the cache, and ways to see what would otherwise take days or minutes. Debug only, not part of the product. */
type Dev = { model: string; grader: string; cache: "on" | "off"; imageOffset: number; reviewEvery: number; limit: Limit };
/** Limits to see without setting them up: no key saved, the provider refusing the key, or model calls failing. */
export type Limit = "none" | "nokey" | "refused" | "fail";
const DEFAULTS: Dev = { model: "haiku", grader: "haiku", cache: "on", imageOffset: 0, reviewEvery: 30, limit: "none" };
const stored = read<Partial<Dev>>("homeDev", {});
export const dev = $state<Dev>({
	...DEFAULTS,
	...stored,
	reviewEvery: [30, 5].includes(Number(stored.reviewEvery)) ? Number(stored.reviewEvery) : 30,
	limit: ["nokey", "refused", "fail"].includes(stored.limit as string) ? (stored.limit as Limit) : "none",
});
export const saveDev = () => write("homeDev", dev);
