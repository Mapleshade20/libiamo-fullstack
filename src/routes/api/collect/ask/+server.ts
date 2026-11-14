import { collectInput } from "#lib/server/collect.ts";
import { ask } from "#model/collect.ts";

export async function POST({ request }) {
	const b = await request.json();
	const history = (Array.isArray(b.history) ? b.history : [])
		.slice(-6)
		.map((t: { q: unknown; a: unknown }) => ({ q: String(t.q ?? ""), a: String(t.a ?? "") }));
	return Response.json({
		answer: await ask(await collectInput(b), String(b.phrase ?? ""), history, String(b.question ?? "").slice(0, 500)),
	});
}
