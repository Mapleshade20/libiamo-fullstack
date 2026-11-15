import type { z } from "zod";
import type { ModelCache } from "./cache.ts";
import { Discarded, type Lanes, type LiveCall } from "./lanes.ts";
import { type Effort, LimitError, type Message, type Route, type SendLimits, send, type Usage } from "./transport.ts";

/*
 * Who pays for a model call and what it is for. The model layer takes a Caller wherever it calls a model, never a
 * global: the route (provider, model, key), the purpose the call serves, whether it is a guess made ahead of need
 * (the revision's background lane), and where its record goes. `for` and `ahead` give the same caller another
 * purpose. Without a route the call stops with "nokey" before anything is sent.
 */

export type CallRecord = {
	purpose: string;
	tag: string;
	model: string;
	provider: string;
	effort: Effort;
	state: "done" | "failed" | "repaired" | "discarded";
	background: boolean;
	messages: Message[];
	output?: string;
	error?: string;
	usage?: Usage;
	costUsd?: number;
	ms?: number;
	/** The revision's step in force when the call started. */
	step: number | null;
};
/** Where a caller's calls are recorded (`llm_call` rows); a failure here never reaches the call. */
export type Recorder = (r: CallRecord) => void;

export type CallerInit = {
	route: Route | null;
	/** How grading asks (lib/llm/providers.ts graderFor). */
	grader?: "g2" | "g3";
	/** The model that answers decisions on the route's key (lib/llm/providers.ts decisionModelFor); none: the chat model. */
	decision?: string | null;
	lanes?: Lanes;
	cache?: ModelCache;
	/** Ask the provider even when the cache holds the request (the cache is still written). */
	fresh?: boolean;
	record?: Recorder;
	/** The revision's current step, for the record. */
	step?: () => number | null;
};

export class Caller {
	constructor(
		readonly init: CallerInit,
		readonly purpose = "",
		readonly background = false,
	) {}
	get route() {
		return this.init.route;
	}
	get grader() {
		return this.init.grader ?? "g3";
	}
	get lanes() {
		return this.init.lanes;
	}
	/** The same caller, for another purpose (a guess stays a guess). */
	for(purpose: string) {
		return new Caller(this.init, purpose, this.background);
	}
	/** The same caller making a guess at what comes next: it waits in the background lane. */
	ahead(purpose: string) {
		return new Caller(this.init, purpose, true);
	}
}

export type CallOptions = {
	ai: Caller;
	effort?: Effort;
	/** Distinct samples of the same request get distinct cache entries. */
	sample?: number;
	/** Names the call in records and the cache, e.g. "session/hint". */
	tag: string;
	/** A call that must answer soon. */
	limits?: SendLimits;
};
export type CallResult = { text: string; usage: Usage; ms: number; cached: boolean; costUsd: number };

export async function chat(messages: Message[], opts: CallOptions): Promise<CallResult> {
	const ai = opts.ai;
	const route = ai.route;
	if (!route) throw new LimitError("nokey");
	const effort = opts.effort ?? "medium";
	const { cache, lanes, record } = ai.init;
	const live: LiveCall | undefined = lanes?.begin(ai.purpose, opts.tag, route.model, ai.background);
	const key = { model: route.model, effort, sample: opts.sample ?? 0, messages, tag: opts.tag };
	const base = {
		purpose: ai.purpose,
		tag: opts.tag,
		model: route.model,
		provider: route.provider,
		effort,
		background: ai.background,
		messages,
		step: ai.init.step?.() ?? null,
	};
	const hit = cache && !ai.init.fresh ? cache.get(key) : null;
	if (hit) {
		if (live) lanes?.finish(live, { state: "cached", ms: 0 });
		return { text: hit.text, usage: hit.usage, ms: hit.ms, cached: true, costUsd: hit.costUsd };
	}
	try {
		if (cache?.only) throw new LimitError("error", `${opts.tag} ${route.model}: not in the cache (replay)`);
		// Only calls that reach the provider take a turn; cache hits are free.
		const release = live && lanes ? await lanes.gate(live) : () => {};
		try {
			const r = await send(route, messages, effort, opts.limits);
			cache?.put(key, r);
			const discarded = live?.state === "discarded";
			if (live) lanes?.finish(live, { state: "done", ms: r.ms });
			safely(record, {
				...base,
				state: discarded ? "discarded" : opts.tag.endsWith("/repair") ? "repaired" : "done",
				output: r.text,
				usage: r.usage,
				costUsd: r.costUsd,
				ms: r.ms,
			});
			return { text: r.text, usage: r.usage, ms: r.ms, cached: false, costUsd: r.costUsd };
		} finally {
			release();
		}
	} catch (e) {
		const error = String((e as Error)?.message ?? e);
		if (live) lanes?.finish(live, { state: "failed", error });
		if (!(e instanceof Discarded)) safely(record, { ...base, state: "failed", error });
		throw e;
	}
}

function safely(record: Recorder | undefined, r: CallRecord) {
	if (!record) return;
	try {
		record(r);
	} catch (e) {
		console.error("call record failed:", e);
	}
}

/** Pull the first JSON value out of a reply (models wrap it in fences or prose). */
export function extractJson(text: string): unknown {
	const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
	const body = (fenced ? fenced[1] : text).trim();
	const start = body.search(/[[{]/);
	if (start < 0) throw new Error("no JSON in reply");
	return JSON.parse(body.slice(start, Math.max(body.lastIndexOf("}"), body.lastIndexOf("]")) + 1));
}

/** A reply validated against its schema, with one targeted repair: the model is shown its reply and what was wrong. */
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
	if (!q.ok) throw new LimitError("error", `${opts.tag} ${opts.ai.route?.model}: invalid JSON after repair: ${q.error}`);
	return { value: q.value, calls: [first, second] };
}
/** Records a call made outside `chat` (a Decisions API request) the way `chat` records its own. */
export const recordCall = safely;
export type { Effort, Message } from "./transport.ts";
