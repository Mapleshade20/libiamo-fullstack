/*
 * The tour's model calls, from a tape: while it plays, every request that would reach a model (any POST to /api) is
 * answered from a recording of the same tour, so the tour costs nothing, never fails, and reads the same every time.
 * Anything not on the tape gets a refusal, never the network. Recording (dev only) lets the requests through and keeps
 * the answers; the tape is then saved as `tapes/<lang>-<tutor>.json`.
 *
 * Requests are matched by path (a session's id stripped) and body; the same request asked again gets the next answer
 * recorded for it, and a request whose body differs from the recording falls back to the next answer for its path.
 */
export type Entry = { key: string; body: string; status: number; reply: string; ms: number };
export type Tape = Entry[];

const sessionId = /^\/api\/s\/[^/]+\//;
const pathOf = (url: string) => new URL(url, location.origin).pathname.replace(sessionId, "/api/s/*/");
const caught = (url: string, method: string) => method.toUpperCase() === "POST" && pathOf(url).startsWith("/api/");

let real: typeof fetch | null = null;
let playback = 0;

export function playTape(tape: Tape, opts: { pace?: number } = {}) {
	stopTape();
	const epoch = playback;
	const used = new Set<number>();
	const pace = opts.pace ?? 0.35;
	real = window.fetch;
	const through = real;
	window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
		// Fail closed for accidental real application queries/writes. Display data comes from the sandbox,
		// never from intercepting an implementation-specific remote-function response format.
		if (new URL(url, location.origin).pathname.startsWith("/_app/remote/")) throw new Error("A tour page tried to access live application data.");
		if (!caught(url, init?.method ?? (input instanceof Request ? input.method : "GET"))) return through(input, init);
		const key = pathOf(url);
		const body = typeof init?.body === "string" ? init.body : "";
		let i = tape.findIndex((e, n) => !used.has(n) && e.key === key && e.body === body);
		if (i < 0) i = tape.findIndex((e, n) => !used.has(n) && e.key === key);
		if (i < 0)
			return new Response(JSON.stringify({ error: "Not part of the tour." }), { status: 503, headers: { "content-type": "application/json" } });
		used.add(i);
		const e = tape[i];
		// A model takes a moment: the tour keeps some of the recorded wait, so the page's waiting states show.
		await new Promise((r) => setTimeout(r, Math.min(1600, e.ms * pace)));
		if (epoch !== playback) throw new DOMException("Tour chapter changed", "AbortError");
		return new Response(e.reply, { status: e.status, headers: { "content-type": "application/json" } });
	};
}

export function recordTape(): Tape {
	stopTape();
	const tape: Tape = [];
	real = window.fetch;
	const through = real;
	window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
		if (!caught(url, init?.method ?? "GET")) return through(input, init);
		const t0 = performance.now();
		const r = await through(input, init);
		const reply = await r.clone().text();
		tape.push({
			key: pathOf(url),
			body: typeof init?.body === "string" ? init.body : "",
			status: r.status,
			reply,
			ms: Math.round(performance.now() - t0),
		});
		return r;
	};
	return tape;
}

export function stopTape() {
	playback++;
	if (real) window.fetch = real;
	real = null;
}
