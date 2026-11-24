import { learner } from "#lib/server/guard.ts";
import { learnerCaller } from "#lib/server/llm/callers.ts";
import type { CollectInput } from "#lib/server/notebook/collect.ts";

/** What both of the stealing notebook's calls take from the page (src/model/collect.ts). */
export const collectSetup = (b: Record<string, unknown>): Omit<CollectInput, "ai"> => ({
	passage: String(b.passage ?? "").slice(0, 12_000),
	lang: String(b.lang ?? "en"),
	native: String(b.native ?? "en"),
	feedback: b.feedback === "target" ? "target" : "native",
});

/** The learner's own key for them, its calls recorded with the reading they are about (one of the learner's, or none). */
export const collectCaller = async (readingId: string | null) => (await learnerCaller({ user: learner(), readingId })).for("collect");
