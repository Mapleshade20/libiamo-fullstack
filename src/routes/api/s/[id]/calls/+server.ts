import { bus, type Call, sessionCalls } from "#model/trace.ts";

// Debug only: a trace id's model calls as server-sent events, for the page's call bubbles.
export function GET({ params, request }) {
	const id = params.id;
	let send: (c: Call) => void;
	const stream = new ReadableStream({
		start(controller) {
			const enc = new TextEncoder();
			send = (c) => controller.enqueue(enc.encode(`data: ${JSON.stringify(c)}\n\n`));
			for (const c of sessionCalls(id)) send(c);
			bus.on(id, send);
			request.signal.addEventListener("abort", () => {
				bus.off(id, send);
				try {
					controller.close();
				} catch {}
			});
		},
		cancel() {
			bus.off(id, send);
		},
	});
	return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" } });
}
