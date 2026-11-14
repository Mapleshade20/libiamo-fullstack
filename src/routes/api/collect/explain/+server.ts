import { error, json } from "@sveltejs/kit";
import { collectInput } from "$lib/server/collect";
import { traced } from "$lib/server/sessions";
import { explain } from "$model/collect.ts";

export async function POST({ request }) {
	const b = await request.json();
	const hs = (Array.isArray(b.highlights) ? b.highlights : [])
		.slice(0, 12)
		.map((h: { n: unknown; text: unknown }) => ({ n: Number(h.n), text: String(h.text ?? "").slice(0, 200) }));
	if (!hs.length) error(400, "nothing highlighted");
	return json({ items: await traced(request, "collect", () => explain(collectInput(b), hs, Number(b.retry) || 0)) });
}
