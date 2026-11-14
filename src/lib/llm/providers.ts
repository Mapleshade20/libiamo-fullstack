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
};

export const PROVIDERS: Record<KeyProvider, Provider> = {
	openrouter: { label: "OpenRouter", baseURL: "https://openrouter.ai/api/v1", keys: "https://openrouter.ai/keys", effort: true, cost: true },
	deepseek: { label: "DeepSeek", baseURL: "https://api.deepseek.com", keys: "https://platform.deepseek.com/api_keys", effort: false, cost: false },
	openai: { label: "OpenAI", baseURL: "https://api.openai.com/v1", keys: "https://platform.openai.com/api-keys", effort: true, cost: false },
	glm: {
		label: "Zhipu AI / GLM",
		baseURL: "https://open.bigmodel.cn/api/paas/v4",
		keys: "https://open.bigmodel.cn/usercenter/apikeys",
		effort: false,
		cost: false,
	},
};

/**
 * Setups known to work, one press to fill the key form. The first is the one recommended and the one a new key starts
 * from: everything was tuned on Claude Haiku through OpenRouter. `grader` is how grading asks (GPT Luna judged better
 * told the checks one way, the others the other).
 */
export type Setup = { name: string; provider: KeyProvider; model: string; grader?: "g2" | "g3" };
export const SETUPS: Setup[] = [
	{ name: "Claude Haiku", provider: "openrouter", model: "~anthropic/claude-haiku-latest" },
	{ name: "GPT Luna", provider: "openrouter", model: "~openai/gpt-luna-latest", grader: "g2" },
	{ name: "DeepSeek Flash", provider: "deepseek", model: "deepseek-flash" },
	{ name: "GPT Luna", provider: "openai", model: "gpt-6-luna", grader: "g2" },
];
export const RECOMMENDED = SETUPS[0];
/** How grading asks for a model: as its setup says, else as for Haiku. */
export const graderFor = (provider: string, model: string) => SETUPS.find((s) => s.provider === provider && s.model === model)?.grader ?? "g3";
