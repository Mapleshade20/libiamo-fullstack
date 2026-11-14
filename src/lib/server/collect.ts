import { learner } from "#lib/server/guard.ts";
import { learnerCaller } from "#lib/server/llm/callers.ts";
import type { CollectInput } from "#lib/server/notebook/collect.ts";

// What both of the stealing notebook's calls take (src/model/collect.ts), on the learner's own key.
export const collectInput = async (b: Record<string, unknown>): Promise<CollectInput> => ({
	passage: String(b.passage ?? "").slice(0, 12_000),
	lang: String(b.lang ?? "en"),
	native: String(b.native ?? "en"),
	feedback: b.feedback === "target" ? "target" : "native",
	ai: (await learnerCaller({ user: learner() })).for("collect"),
});
