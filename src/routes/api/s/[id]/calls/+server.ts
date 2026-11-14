import { learner } from "#lib/server/guard.ts";
import type { LiveCall } from "#lib/server/llm/lanes.ts";
import { sessions } from "#lib/server/sessions.ts";

// Debug only: a session's model calls as server-sent events, for the page's call bubbles.
export function GET({ params, request }) {
	const u = learner();
	const held = sessions.get(params.id);
	const lanes = held?.owner === u.id ? held.session.ai.lanes : undefined;
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
