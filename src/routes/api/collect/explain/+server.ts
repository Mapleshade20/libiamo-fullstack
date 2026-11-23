import { error } from "@sveltejs/kit";
import { z } from "zod";
import { LEARNABLE } from "#lib/constants.ts";
import { collectCaller, collectSetup } from "#lib/server/collect.ts";
import { learner } from "#lib/server/guard.ts";
import { type Answer, keptAlive } from "#lib/server/kept-alive.ts";
import { stopOf } from "#lib/server/llm/transport.ts";
import { type CollectInput, explain, type Highlight } from "#lib/server/notebook/collect.ts";
import { fileCollected, readingFor } from "#lib/server/notebook/notes.ts";

type Marked = Highlight & { sentence: string };

/* Fills in what the learner highlighted in something they read, and keeps each phrase in their notebook at once: the
   reading is kept with the first (its id comes back for the next), every phrase as an entry (their ids come back, so
   a mark undone or changed can take its entry away). */
export async function POST({ request }) {
	const u = learner();
	const b = await request.json();
	const hs: Marked[] = (Array.isArray(b.highlights) ? b.highlights : []).slice(0, 12).map((h: { n: unknown; text: unknown; sentence?: unknown }) => ({
		n: Number(h.n),
		text: String(h.text ?? "").slice(0, 200),
		sentence: String(h.sentence ?? "").slice(0, 1000),
	}));
	if (!hs.length) error(400, "nothing highlighted");
	const setup = collectSetup(b);
	if (!(LEARNABLE as readonly string[]).includes(setup.lang)) error(400, "unknown language");
	// The reading first (the page's, when it is theirs), so the call is recorded with it.
	const readingId = await readingFor(u.id, {
		id: z.guid().safeParse(b.readingId).data,
		text: setup.passage,
		language: setup.lang,
		place: typeof b.place === "string" ? b.place.slice(0, 40) : undefined,
	});
	const d: CollectInput = { ...setup, ai: await collectCaller(readingId) };
	// The answer is kept alive past Cloudflare's 100 seconds (server/kept-alive.ts).
	return keptAlive(fill(u, b, d, hs, readingId));
}

async function fill(u: ReturnType<typeof learner>, b: Record<string, unknown>, d: CollectInput, hs: Marked[], readingId: string): Promise<Answer> {
	const items = await explain(d, hs, Number(b.retry) || 0).catch((e) => e as Error);
	if (items instanceof Error) return { body: { error: items.message, code: stopOf(items) }, status: 502 };
	const { ids } = await fileCollected(
		u,
		{ id: readingId, text: d.passage, language: d.lang, tutorLanguage: d.feedback === "target" ? d.lang : d.native },
		items.map((it) => {
			const h = hs.find((x) => x.n === it.n);
			return { ...it, marked: h?.text ?? it.phrase, sentence: h?.sentence ?? "" };
		}),
	);
	return { body: { readingId, items: items.map((it, i) => ({ ...it, id: ids[i] })) } };
}
