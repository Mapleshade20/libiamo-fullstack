import { json } from "@sveltejs/kit";
import { collectInput } from "$lib/server/collect";
import { traced } from "$lib/server/sessions";
import { ask } from "$model/collect.ts";

export async function POST({ request }) {
	const b = await request.json();
	const history = (Array.isArray(b.history) ? b.history : [])
		.slice(-6)
		.map((t: { q: unknown; a: unknown }) => ({ q: String(t.q ?? ""), a: String(t.a ?? "") }));
	return json({
		answer: await traced(request, "collect · ask", () =>
			ask(collectInput(b), String(b.phrase ?? ""), history, String(b.question ?? "").slice(0, 500)),
		),
	});
}
