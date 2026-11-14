import { error } from "@sveltejs/kit";
import { LEARNABLE } from "#lib/constants.ts";
import { collectInput } from "#lib/server/collect.ts";
import { learner } from "#lib/server/guard.ts";
import { explain } from "#lib/server/notebook/collect.ts";
import { fileCollected } from "#lib/server/notebook/notes.ts";

/* Fills in what the learner highlighted in something they read, and keeps each phrase in their notebook at once: the
   reading is kept with the first (its id comes back for the next), every phrase as an entry (their ids come back, so
   a mark undone or changed can take its entry away). */
export async function POST({ request }) {
	const u = learner();
	const b = await request.json();
	const hs = (Array.isArray(b.highlights) ? b.highlights : []).slice(0, 12).map((h: { n: unknown; text: unknown; sentence?: unknown }) => ({
		n: Number(h.n),
		text: String(h.text ?? "").slice(0, 200),
		sentence: String(h.sentence ?? "").slice(0, 1000),
	}));
	if (!hs.length) error(400, "nothing highlighted");
	const d = await collectInput(b);
	if (!(LEARNABLE as readonly string[]).includes(d.lang)) error(400, "unknown language");
	const items = await explain(d, hs, Number(b.retry) || 0);
	const { readingId, ids } = await fileCollected(
		u,
		{
			id: typeof b.readingId === "string" && /^[0-9a-f-]{36}$/.test(b.readingId) ? b.readingId : undefined,
			text: d.passage,
			language: d.lang,
			place: typeof b.place === "string" ? b.place.slice(0, 40) : undefined,
			tutorLanguage: d.feedback === "target" ? d.lang : d.native,
		},
		items.map((it) => {
			const h = hs.find((x: { n: number }) => x.n === it.n);
			return { ...it, marked: h?.text ?? it.phrase, sentence: h?.sentence ?? "" };
		}),
	);
	return Response.json({ readingId, items: items.map((it, i) => ({ ...it, id: ids[i] })) });
}
