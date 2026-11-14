import { AsyncLocalStorage } from "node:async_hooks";
import { EventEmitter } from "node:events";

/**
 * Debug only (the playable demo's call bubbles; not part of the product): every model call a live session makes,
 * with what it was for. A call runs inside the session and purpose it was started from, so prefetches started in
 * the background keep theirs. Results prepared but never used are marked discarded once the session knows.
 */
export type CallState = "queued" | "running" | "done" | "cached" | "failed" | "discarded";
export type Call = {
	id: number;
	sid: string;
	purpose: string;
	tag: string;
	model: string;
	state: CallState;
	t0: number;
	ms?: number;
	/** cacheRead/cacheWrite: the provider's prompt cache, when it reports it. */
	tokens?: { input: number; output: number; reasoning: number; cacheRead?: number; cacheWrite?: number };
	cost?: number;
	input: string;
	output?: string;
	error?: string;
	/** Speculative: started before anyone needs it, so it waits its turn behind the session's other speculative calls. */
	bg?: boolean;
};

/** noCache: the session asked for fresh model calls (the cache is still written, never read). bg: see `inBackground`. */
type Scope = { sid: string; purpose: string; noCache?: boolean; bg?: boolean };
const als = new AsyncLocalStorage<Scope>();
const bySession = new Map<string, Call[]>();
export const bus = new EventEmitter();
bus.setMaxListeners(0);
let next = 0;

export function inSession<T>(sid: string, purpose: string, fn: () => T, noCache = false): T {
	return als.run({ sid, purpose, noCache }, fn);
}
export const skipCache = () => !!als.getStore()?.noCache;
/** Run fn (and whatever it starts) under a purpose; outside a session it just runs. */
export function withPurpose<T>(purpose: string, fn: () => T): T {
	const c = als.getStore();
	return c ? als.run({ ...c, purpose }, fn) : fn();
}
/**
 * Run fn as a prefetch: its calls go through the session's background lane, one at a time, while calls the learner
 * is waiting for never queue. Every call runs on the learner's own key, whose provider caps how many requests run at
 * once, so a page that fired every prefetch at once would get their next real call refused.
 */
export function inBackground<T>(purpose: string, fn: () => T): T {
	const c = als.getStore();
	return c ? als.run({ ...c, purpose, bg: true }, fn) : fn();
}
export const sessionCalls = (sid: string) => bySession.get(sid) ?? [];

/** Speculative calls in flight per session. */
export const BACKGROUND_LANES = 2;
type Waiter = { call: Call; go: (counted: boolean) => void; stop: () => void };
const lanes = new Map<string, { busy: number; queue: Waiter[] }>();
/** Purposes the learner has asked for, per session: their later calls (a JSON repair) skip the lane too. */
const promoted = new Map<string, Set<string>>();
class Cancelled extends Error {}

/**
 * Wait for the call's turn (immediately, unless it is speculative and the lane is busy); returns the release. A
 * queued call the learner turns out to need is promoted (`promote`) and goes at once; one found unneeded
 * (`discard`) never starts.
 */
export async function gate(call: Call | null): Promise<() => void> {
	if (!call?.bg) return () => {};
	const lane = lanes.get(call.sid) ?? { busy: 0, queue: [] };
	lanes.set(call.sid, lane);
	// A turn is counted when it is given, not when the waiter wakes up: release hands turns out in a loop.
	let counted = true;
	if (lane.busy < BACKGROUND_LANES) lane.busy++;
	else {
		call.state = "queued";
		emit(call);
		counted = await new Promise<boolean>((go, stop) => lane.queue.push({ call, go, stop: () => stop(new Cancelled("discarded before it started")) }));
		call.t0 = Date.now();
		call.state = "running";
		emit(call);
	}
	return () => {
		if (counted) lane.busy--;
		while (lane.busy < BACKGROUND_LANES && lane.queue.length) {
			lane.busy++;
			lane.queue.shift()!.go(true);
		}
	};
}
/** The learner is now waiting for these: queued calls whose purpose matches leave the lane and start. */
export function promote(sid: string, match: (purpose: string) => boolean) {
	const lane = lanes.get(sid);
	for (const c of bySession.get(sid) ?? [])
		if (c.bg && match(c.purpose)) (promoted.get(sid) ?? promoted.set(sid, new Set()).get(sid)!).add(c.purpose);
	if (!lane) return;
	for (const w of lane.queue.filter((w) => match(w.call.purpose))) {
		lane.queue.splice(lane.queue.indexOf(w), 1);
		w.call.bg = false;
		w.go(false);
	}
}

const clip = (s: string, n = 6000) => (s.length > n ? `${s.slice(0, n)}\n…(${s.length - n} more)` : s);
const emit = (c: Call) => bus.emit(c.sid, c);

export function begin(tag: string, model: string, messages: { role: string; content: string }[]): Call | null {
	const c = als.getStore();
	if (!c) return null;
	const call: Call = {
		id: ++next,
		sid: c.sid,
		purpose: c.purpose,
		tag,
		model,
		state: "running",
		t0: Date.now(),
		...(c.bg && !promoted.get(c.sid)?.has(c.purpose) ? { bg: true } : {}),
		input: clip(messages.map((m) => `[${m.role}]\n${m.content}`).join("\n\n")),
	};
	const list = bySession.get(c.sid) ?? [];
	list.push(call);
	if (list.length > 400) list.shift();
	bySession.set(c.sid, list);
	emit(call);
	return call;
}
export function finish(call: Call | null, patch: Partial<Call>) {
	if (!call) return;
	// A call already known to be unneeded stays discarded, with its timing filled in.
	const state = call.state === "discarded" ? "discarded" : patch.state;
	Object.assign(call, patch, { state, ms: patch.ms ?? Date.now() - call.t0, output: patch.output === undefined ? call.output : clip(patch.output) });
	emit(call);
}
/** Mark the session's calls whose purpose matches as not needed (prefetches that lost, a superseded detection). */
export function discard(sid: string, match: (purpose: string) => boolean) {
	for (const c of bySession.get(sid) ?? []) {
		if (c.state === "failed" || c.state === "discarded" || !match(c.purpose)) continue;
		const queued = lanes.get(sid)?.queue.find((w) => w.call === c);
		c.state = "discarded";
		emit(c);
		if (queued) {
			lanes.get(sid)!.queue.splice(lanes.get(sid)!.queue.indexOf(queued), 1);
			queued.stop();
		}
	}
}
export const currentSession = () => als.getStore()?.sid;
