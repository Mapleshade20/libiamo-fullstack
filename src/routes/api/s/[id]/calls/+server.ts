import { learner } from "#lib/server/guard.ts";
import type { LiveCall } from "#lib/server/llm/lanes.ts";
import { heldRevision } from "#lib/server/revision/store.ts";

// Debug only: a revision's model calls as server-sent events, for the page's call bubbles.
export function GET({ params, request }) {
	const u = learner();
	const lanes = heldRevision(params.id, u.id)?.session.ai.lanes;
	if (!lanes) return new Response(null, { status: 204 });
	let send: (c: LiveCall) => void;
	const stream = new ReadableStream({
		start(controller) {
			const enc = new TextEncoder();
			send = (c) => controller.enqueue(enc.encode(`data: ${JSON.stringify(c)}\n\n`));
			for (const c of lanes.calls) send(c);
			lanes.events.on("call", send);
			request.signal.addEventListener("abort", () => {
				lanes.events.off("call", send);
				try {
					controller.close();
				} catch {}
			});
		},
		cancel() {
			lanes.events.off("call", send);
		},
	});
	return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" } });
}
