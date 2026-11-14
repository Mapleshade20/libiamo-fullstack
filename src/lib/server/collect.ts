import { MODELS, type ModelKey } from "$model/llm.ts";

// What both of the stealing notebook's calls take (src/collect.ts).
export const collectInput = (b: Record<string, unknown>) => ({
	passage: String(b.passage ?? "").slice(0, 12_000),
	lang: String(b.lang ?? "en"),
	native: String(b.native ?? "en"),
	feedback: b.feedback === "target" ? ("target" as const) : ("native" as const),
	model: (String(b.model) in MODELS ? b.model : "haiku") as ModelKey,
});
