import { collectInput } from "#lib/server/collect.ts";
import { stopOf } from "#lib/server/llm/transport.ts";
import { ask } from "#lib/server/notebook/collect.ts";

export async function POST({ request }) {
	const b = await request.json();
	const history = (Array.isArray(b.history) ? b.history : [])
		.slice(-6)
		.map((t: { q: unknown; a: unknown }) => ({ q: String(t.q ?? ""), a: String(t.a ?? "") }));
	try {
		return Response.json({
			answer: await ask(await collectInput(b), String(b.phrase ?? ""), history, String(b.question ?? "").slice(0, 500)),
		});
	} catch (e) {
		return Response.json({ error: String((e as Error)?.message ?? e), code: stopOf(e) }, { status: 502 });
	}
}
