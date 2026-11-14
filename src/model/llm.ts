import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import OpenAI from "openai";
import type { z } from "zod";
import { begin, type Call, finish, gate, skipCache } from "./trace.ts";

// Credentials: the repository's .env (OPENROUTER_API_KEY, or OPENAI_API_KEY with OPENAI_BASE_URL).
const ROOT = process.cwd();
if (existsSync(join(ROOT, ".env"))) process.loadEnvFile(join(ROOT, ".env"));

export const MODELS = {
	luna: "~openai/gpt-luna-latest",
	haiku: "~anthropic/claude-haiku-latest",
	deepseek: "~deepseek/deepseek-flash-latest",
} as const;
export type ModelKey = keyof typeof MODELS;
/** The models experiments run by default (user, 2026-10-23: tune for deepseek and haiku; luna stays for reference). */
export const DEFAULT_MODELS: ModelKey[] = ["deepseek", "haiku"];

let client: OpenAI | undefined;
/** Made on the first call, so tests and scripts that never call a model run without a key. */
function openRouter() {
	const apiKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;
	if (!apiKey) throw new Error("No API key: copy .env.example to .env and set OPENROUTER_API_KEY.");
	const baseURL = process.env.OPENROUTER_API_KEY ? "https://openrouter.ai/api/v1" : process.env.OPENAI_BASE_URL;
	client ??= new OpenAI({ apiKey, baseURL, timeout: 300_000, maxRetries: 2 });
	return client;
}

export type Message = { role: "system" | "user" | "assistant"; content: string };
export type CallOptions = {
	model: ModelKey;
	effort?: "low" | "medium" | "high";
	/** Distinct samples of the same request get distinct cache entries. */
	sample?: number;
	/** Names the call in traces, e.g. "e1/s2/rewrite". */
	tag: string;
};
/** cacheRead/cacheWrite: input tokens the provider served from, or wrote to, its prompt cache. */
export type CallResult = {
	text: string;
	usage: { input: number; output: number; reasoning: number; cacheRead?: number; cacheWrite?: number };
	ms: number;
	cached: boolean;
	costUsd: number;
};

/** LLM_CACHE_DIR: another cache to read and write (the rehearsal lab's, to replay its recorded sessions). */
const CACHE = process.env.LLM_CACHE_DIR ?? join(ROOT, "runs/cache");

export async function chat(messages: Message[], opts: CallOptions): Promise<CallResult> {
	// The live demo's call bubbles see every call (a no-op outside a live session).
	const trace = begin(opts.tag, opts.model, messages);
	try {
		const r = await call(messages, opts, trace);
		finish(trace, { state: r.cached ? "cached" : "done", ms: r.cached ? 0 : r.ms, tokens: r.usage, cost: r.costUsd, output: r.text });
		return r;
	} catch (e) {
		finish(trace, { state: "failed", error: String((e as Error)?.message ?? e) });
		throw e;
	}
}

async function call(messages: Message[], opts: CallOptions, trace: Call | null): Promise<CallResult> {
	const model = MODELS[opts.model];
	const effort = opts.effort ?? "medium";
	const key = createHash("sha256")
		.update(JSON.stringify({ model, effort, sample: opts.sample ?? 0, messages }))
		.digest("hex")
		.slice(0, 24);
	const file = join(CACHE, opts.tag.replaceAll("/", "_"), `${opts.model}-${key}.json`);
	if (existsSync(file) && !skipCache()) {
		const hit = JSON.parse(readFileSync(file, "utf8"));
		return { ...hit.result, cached: true };
	}
	// LLM_CACHE_ONLY: a replay must never reach a provider; a request the cache does not hold is an error.
	if (process.env.LLM_CACHE_ONLY) throw new Error(`${opts.tag} ${opts.model}: not in the cache (LLM_CACHE_ONLY)`);
	// Only calls that reach the provider take a turn; cache hits are free.
	const release = await gate(trace);
	try {
		return await request(messages, opts, file);
	} finally {
		release();
	}
}

async function request(messages: Message[], opts: CallOptions, file: string): Promise<CallResult> {
	const model = MODELS[opts.model];
	const effort = opts.effort ?? "medium";
	const t0 = Date.now();
	const create = () =>
		openRouter().chat.completions.create({
			model,
			messages,
			max_tokens: 32_768,
			// OpenRouter normalises this across providers; thinking stays on, as in the app.
			reasoning_effort: effort,
			// @ts-expect-error OpenRouter extension: report cost in usage.
			usage: { include: true },
		});
	let res: OpenAI.ChatCompletion | undefined;
	// The SDK retries HTTP errors; a body cut off mid-response ("terminated") needs its own retry.
	for (let attempt = 0; !res; attempt++) {
		try {
			res = (await create()) as OpenAI.ChatCompletion;
			// Providers occasionally return an empty completion; one retry, then let the caller see it.
			if (!res.choices[0]?.message?.content && attempt < 1) res = undefined;
		} catch (e) {
			if (attempt >= 2 || !/terminated|ECONNRESET|socket/i.test(String(e))) throw e;
		}
	}
	const ms = Date.now() - t0;
	const choice = res.choices[0];
	const text = choice?.message?.content ?? "";
	const u = res.usage as
		| (OpenAI.CompletionUsage & { cost?: number; prompt_tokens_details?: { cached_tokens?: number; cache_write_tokens?: number } })
		| undefined;
	const result: CallResult = {
		text,
		usage: {
			input: u?.prompt_tokens ?? 0,
			output: u?.completion_tokens ?? 0,
			reasoning: u?.completion_tokens_details?.reasoning_tokens ?? 0,
			cacheRead: u?.prompt_tokens_details?.cached_tokens ?? 0,
			cacheWrite: u?.prompt_tokens_details?.cache_write_tokens ?? 0,
		},
		ms,
		cached: false,
		costUsd: u?.cost ?? 0,
	};
	if (!text) throw new Error(`${opts.tag} ${opts.model}: empty response (finish ${choice?.finish_reason})`);
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, JSON.stringify({ model, effort, sample: opts.sample ?? 0, messages, result, finish: choice?.finish_reason }, null, "\t"));
	return result;
}

/** Pull the first JSON value out of a reply (models wrap it in fences or prose). */
export function extractJson(text: string): unknown {
	const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
	const body = (fenced ? fenced[1] : text).trim();
	const start = body.search(/[[{]/);
	if (start < 0) throw new Error("no JSON in reply");
	return JSON.parse(body.slice(start, Math.max(body.lastIndexOf("}"), body.lastIndexOf("]")) + 1));
}

/** One targeted repair, as in the app: show the model its own reply and the validation error. */
export async function chatJson<T>(messages: Message[], schema: z.ZodType<T>, opts: CallOptions): Promise<{ value: T; calls: CallResult[] }> {
	const first = await chat(messages, opts);
	const tryParse = (text: string) => {
		try {
			const r = schema.safeParse(extractJson(text));
			return r.success ? { ok: true as const, value: r.data } : { ok: false as const, error: r.error.message };
		} catch (e) {
			return { ok: false as const, error: String(e) };
		}
	};
	const p = tryParse(first.text);
	if (p.ok) return { value: p.value, calls: [first] };
	const second = await chat(
		[
			...messages,
			{ role: "assistant", content: first.text },
			{ role: "user", content: `Your reply did not validate:\n${p.error}\nReply again with the corrected JSON only.` },
		],
		{ ...opts, tag: `${opts.tag}/repair` },
	);
	const q = tryParse(second.text);
	if (!q.ok) throw new Error(`${opts.tag} ${opts.model}: invalid JSON after repair: ${q.error}`);
	return { value: q.value, calls: [first, second] };
}
