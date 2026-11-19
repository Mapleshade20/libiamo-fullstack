import type { KeyProvider } from "#lib/constants.ts";

/*
 * The providers a learner's key can come from, and the setups known to work. Every provider speaks OpenAI's chat
 * completions; what differs is the base URL, whether it takes `reasoning_effort`, and whether it reports a call's cost.
 * Shared with the key form, so nothing here is secret.
 */
export type Provider = {
	label: string;
	baseURL: string;
	/** Where a learner makes a key. */
	keys: string;
	/** Whether the provider takes OpenAI's `reasoning_effort` (thinking stays on either way). */
	effort: boolean;
	/** OpenRouter reports what a call cost when asked (`usage: { include: true }`). */
	cost: boolean;
	/** What turns thinking off in a request, for the short calls that want a quick answer. */
	noThinking: Record<string, unknown>;
	/**
	 * The provider's Decisions API (a typed choice with probabilities, no text) and the models it runs, the first the
	 * default; a provider without one answers the gate's questions with the learner's chat model instead.
	 */
	decisions?: { api: DecisionsApi; models: { id: string; name: string }[] };
};
export type DecisionsApi = "openrouter" | "openai";

export const PROVIDERS: Record<KeyProvider, Provider> = {
	openrouter: {
		label: "OpenRouter",
		baseURL: "https://openrouter.ai/api/v1",
		keys: "https://openrouter.ai/keys",
		effort: true,
		cost: true,
		noThinking: { reasoning: { effort: "none" } },
		decisions: {
			api: "openrouter",
			models: [
				{ id: "~typesafe/jev-latest", name: "Jev" },
				{ id: "openai/gpt-6-luna-decisions", name: "GPT-6 Luna Decisions" },
				{ id: "google/gemini-decision-1", name: "Gemini Decision 1" },
			],
		},
	},
	deepseek: {
		label: "DeepSeek",
		baseURL: "https://api.deepseek.com",
		keys: "https://platform.deepseek.com/api_keys",
		effort: false,
		cost: false,
		noThinking: { thinking: { type: "disabled" } },
	},
	openai: {
		label: "OpenAI",
		baseURL: "https://api.openai.com/v1",
		keys: "https://platform.openai.com/api-keys",
		effort: true,
		cost: false,
		noThinking: { reasoning_effort: "none" },
		decisions: { api: "openai", models: [{ id: "gpt-6-luna", name: "GPT-6 Luna" }] },
	},
	glm: {
		label: "Zhipu AI / GLM",
		baseURL: "https://open.bigmodel.cn/api/paas/v4",
		keys: "https://open.bigmodel.cn/usercenter/apikeys",
		effort: false,
		cost: false,
		noThinking: { thinking: { type: "disabled" } },
	},
};

/**
 * Setups known to work, one press to fill the key form. Everything was tuned on Claude Haiku through OpenRouter, the
 * setup recommended unless a language learnt has its own (`RECOMMENDED_FOR`). `grader` is how grading asks (GPT Luna
 * judged better told the checks one way, the others the other).
 */
export type Setup = { name: string; provider: KeyProvider; model: string; grader?: "g2" | "g3" };
export const SETUPS: Setup[] = [
	{ name: "Claude Haiku", provider: "openrouter", model: "~anthropic/claude-haiku-latest" },
	// Through OpenRouter, the gate keeps its Decisions API (a DeepSeek key has none, and its thresholds are per model).
	{ name: "DeepSeek Flash", provider: "openrouter", model: "~deepseek/deepseek-flash-latest" },
	{ name: "GPT Luna", provider: "openrouter", model: "~openai/gpt-luna-latest", grader: "g2" },
	{ name: "DeepSeek Flash", provider: "deepseek", model: "deepseek-flash" },
	{ name: "GPT Luna", provider: "openai", model: "gpt-6-luna", grader: "g2" },
];
const setup = (provider: KeyProvider, model: string) => SETUPS.find((s) => s.provider === provider && s.model === model) as Setup;
export const RECOMMENDED = setup("openrouter", "~anthropic/claude-haiku-latest");
/**
 * Languages learnt that a setup other than the default serves better. Chinese: Haiku took "走路了三个小时" (a duration
 * inside a verb-object compound) for a matter of taste, one time in two, and never named the rule; DeepSeek Flash
 * flagged it every time (2026-11-18).
 */
export const RECOMMENDED_FOR: Partial<Record<string, Setup>> = {
	"zh-CN": setup("openrouter", "~deepseek/deepseek-flash-latest"),
};
/**
 * The setup recommended to a learner, from the languages they learn in the order they matter (the one worked in first):
 * the first with a setup of its own decides, else the default. One key serves every language.
 */
export const recommendedFor = (languages: readonly string[]): Setup =>
	languages.map((l) => RECOMMENDED_FOR[l]).find((s) => s !== undefined) ?? RECOMMENDED;
/** How grading asks for a model: as its setup says, else as for Haiku. */
export const graderFor = (provider: string, model: string) => SETUPS.find((s) => s.provider === provider && s.model === model)?.grader ?? "g3";

/** The model that answers the gate's questions: the learner's choice if their provider runs it, else its default; null
 * when the provider has no Decisions API (the chat model answers). */
export function decisionModelFor(provider: KeyProvider, chosen: string | null | undefined): string | null {
	const d = PROVIDERS[provider]?.decisions;
	if (!d) return null;
	return d.models.find((m) => m.id === chosen)?.id ?? d.models[0].id;
}
