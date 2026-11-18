/*
 * An answer that waits on a model. Cloudflare, in front of the site, gives up on a response that has not begun within
 * 100 seconds (a 524), and a revision's step on a slow model, or one the SDK retried, can take longer. So an answer that
 * comes within `soon` is sent as usual; past that the response begins (200, JSON), a space goes out every `beat` (JSON
 * allows whitespace before a value) and the answer ends it. Its status is then only in the body: a failed answer always
 * carries `error`, and the page reads it there (lib/llm/stops.ts `answered`, the revision page's `api`).
 */
export type Answer = { body: unknown; status?: number };

const SOON_MS = 20_000;
const BEAT_MS = 15_000;

export async function keptAlive(work: Promise<Answer>, soon = SOON_MS, beat = BEAT_MS): Promise<Response> {
	const answer = work.catch((e): Answer => ({ body: { error: String((e as Error)?.message ?? e) }, status: 500 }));
	let wait: ReturnType<typeof setTimeout> | undefined;
	const early = await Promise.race([answer, new Promise<null>((r) => (wait = setTimeout(() => r(null), soon)))]);
	clearTimeout(wait);
	if (early) return Response.json(early.body, { status: early.status ?? 200 });
	const bytes = new TextEncoder();
	let beating: ReturnType<typeof setInterval> | undefined;
	const body = new ReadableStream<Uint8Array>({
		start(out) {
			out.enqueue(bytes.encode(" "));
			beating = setInterval(() => out.enqueue(bytes.encode(" ")), beat);
			void answer.then((a) => {
				clearInterval(beating);
				// The page may have gone meanwhile; the work is done (and recorded) either way.
				try {
					out.enqueue(bytes.encode(JSON.stringify(a.body)));
					out.close();
				} catch {}
			});
		},
		cancel() {
			clearInterval(beating);
		},
	});
	// nginx would otherwise hold the spaces back until its buffer fills.
	return new Response(body, { headers: { "content-type": "application/json", "cache-control": "no-store", "x-accel-buffering": "no" } });
}
