import { createHash } from "node:crypto";
import OpenAI from "openai";
import type { KeyProvider } from "#lib/constants.ts";
import { type DecisionsApi, PROVIDERS } from "#lib/llm/providers.ts";

/*
 * One request to a provider: the provider table says where it goes and what it takes; one OpenAI client per key; a
 * timeout, the SDK's retries, and a retry of its own for a body cut off mid-response or an empty completion. What
 * the caller learns of a failure is one of the three the page shows (`LimitError`).
 */

export type Message = { role: "system" | "user" | "assistant"; content: string };
/** How hard the model thinks; "none" turns thinking off (the provider's `noThinking`), for quick short answers. */
export type Effort = "none" | "low" | "medium" | "high";
/** Who pays: a provider, the model it runs, the key. */
export type Route = { provider: KeyProvider; model: string; apiKey: string };
/** cacheRead/cacheWrite: input tokens the provider served from, or wrote to, its prompt cache. */
export type Usage = { input: number; output: number; reasoning: number; cacheRead?: number; cacheWrite?: number };
export type Reply = { text: string; usage: Usage; ms: number; costUsd: number; finish: string | null };

/** What stops a call, as the learner meets it: no key saved, the provider turning the key down, anything else. */
export type Stop = "nokey" | "refused" | "error";
export class LimitError extends Error {
	constructor(
		readonly kind: Stop,
		message: string = kind,
	) {
		super(message);
		this.name = "LimitError";
	}
}
export const stopOf = (e: unknown): Stop => (e instanceof LimitError ? e.kind : "error");

/** How long one request may take; a revision's longest calls (the analysis, with thinking) take a minute or two. */
const TIMEOUT_MS = 300_000;
const MAX_TOKENS = 32_768;

const clients = new Map<string, OpenAI>();
function client(route: Route) {
	const id = createHash("sha256").update(`${route.provider}\u0000${route.apiKey}`).digest("hex");
	let c = clients.get(id);
	if (!c) {
		// A few hundred learners at most hold a key in one process; past that the oldest client goes.
		if (clients.size >= 500) clients.delete(clients.keys().next().value as string);
		c = new OpenAI({ apiKey: route.apiKey, baseURL: PROVIDERS[route.provider].baseURL, timeout: TIMEOUT_MS, maxRetries: 2 });
		clients.set(id, c);
	}
	return c;
}

/** A call that must answer soon (the gate): its own timeout and token cap, and no retries. */
export type SendLimits = { timeoutMs: number; maxTokens: number };

export async function send(route: Route, messages: Message[], effort: Effort, limits?: SendLimits): Promise<Reply> {
	const p = PROVIDERS[route.provider];
	const t0 = Date.now();
	const thinking = effort === "none" ? p.noThinking : p.effort ? { reasoning_effort: effort } : {};
	const create = () =>
		client(route).chat.completions.create(
			{
				model: route.model,
				messages,
				max_tokens: limits?.maxTokens ?? MAX_TOKENS,
				...thinking,
				// OpenRouter's extension: report the cost in usage.
				...(p.cost ? { usage: { include: true } } : {}),
			} as OpenAI.ChatCompletionCreateParamsNonStreaming,
			limits ? { timeout: limits.timeoutMs, maxRetries: 0 } : undefined,
		);
	let res: OpenAI.ChatCompletion | undefined;
	for (let attempt = 0; !res; attempt++) {
		try {
			res = await create();
			// Providers occasionally return an empty completion: one retry, then the caller sees it.
			if (!res.choices[0]?.message?.content && attempt < 1 && !limits) res = undefined;
		} catch (e) {
			if (e instanceof OpenAI.APIError && (e.status === 401 || e.status === 402 || e.status === 403))
				throw new LimitError("refused", `${route.provider} refused the key (${e.status})`);
			// The SDK retries HTTP errors; a body cut off mid-response needs a retry of its own.
			if (limits || attempt >= 2 || !/terminated|ECONNRESET|socket/i.test(String(e)))
				throw new LimitError("error", String((e as Error)?.message ?? e));
		}
	}
	const choice = res.choices[0];
	const text = choice?.message?.content ?? "";
	if (!text) throw new LimitError("error", `empty response (finish ${choice?.finish_reason})`);
	const u = res.usage as
		| (OpenAI.CompletionUsage & { cost?: number; prompt_tokens_details?: { cached_tokens?: number; cache_write_tokens?: number } })
		| undefined;
	return {
		text,
		usage: {
			input: u?.prompt_tokens ?? 0,
			output: u?.completion_tokens ?? 0,
			reasoning: u?.completion_tokens_details?.reasoning_tokens ?? 0,
			cacheRead: u?.prompt_tokens_details?.cached_tokens ?? 0,
			cacheWrite: u?.prompt_tokens_details?.cache_write_tokens ?? 0,
		},
		ms: Date.now() - t0,
		costUsd: u?.cost ?? 0,
		finish: choice?.finish_reason ?? null,
	};
}

const DECISIONS: Record<DecisionsApi, string> = {
	openrouter: "https://openrouter.ai/api/alpha/decisions",
	openai: "https://api.openai.com/v1/decisions",
};
export type DecisionsReply = { body: unknown; usage: Usage; costUsd: number; ms: number };

/** One request to a provider's Decisions API: the body as that API takes it, the answer as it gives it. */
export async function sendDecisions(route: Route, api: DecisionsApi, body: unknown, timeoutMs: number): Promise<DecisionsReply> {
	const t0 = Date.now();
	let r: Response;
	try {
		r = await fetch(DECISIONS[api], {
			method: "POST",
			headers: { Authorization: `Bearer ${route.apiKey}`, "Content-Type": "application/json" },
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(timeoutMs),
		});
	} catch (e) {
		throw new LimitError("error", String((e as Error)?.message ?? e));
	}
	if (r.status === 401 || r.status === 402 || r.status === 403) throw new LimitError("refused", `${route.provider} refused the key (${r.status})`);
	if (!r.ok) throw new LimitError("error", `HTTP ${r.status}: ${(await r.text().catch(() => "")).slice(0, 300)}`);
	const j = (await r.json()) as {
		usage?: { cost?: number; prompt_tokens?: number; input_tokens?: number; input_tokens_details?: { cached_tokens?: number } };
	};
	const u = j.usage;
	return {
		body: j,
		usage: { input: u?.input_tokens ?? u?.prompt_tokens ?? 0, output: 0, reasoning: 0, cacheRead: u?.input_tokens_details?.cached_tokens ?? 0 },
		costUsd: u?.cost ?? 0,
		ms: Date.now() - t0,
	};
}
