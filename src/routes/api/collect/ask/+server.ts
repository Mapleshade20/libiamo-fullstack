import { z } from "zod";
import { collectCaller, collectSetup } from "#lib/server/collect.ts";
import { learner } from "#lib/server/guard.ts";
import { type Answer, keptAlive } from "#lib/server/kept-alive.ts";
import { stopOf } from "#lib/server/llm/transport.ts";
import { ask } from "#lib/server/notebook/collect.ts";
import { ownReading } from "#lib/server/notebook/notes.ts";

/* A question about a phrase kept from a reading, answered with what was read (recorded with that reading). */
export async function POST({ request }) {
	const u = learner();
	const b = await request.json();
	const readingId = await ownReading(u.id, z.guid().safeParse(b.readingId).data);
	const history = (Array.isArray(b.history) ? b.history : [])
		.slice(-6)
		.map((t: { q: unknown; a: unknown }) => ({ q: String(t.q ?? ""), a: String(t.a ?? "") }));
	// The answer is kept alive past Cloudflare's 100 seconds (server/kept-alive.ts).
	return keptAlive(
		(async (): Promise<Answer> => {
			try {
				return {
					body: {
						answer: await ask(
							{ ...collectSetup(b), ai: await collectCaller(readingId) },
							String(b.phrase ?? ""),
							history,
							String(b.question ?? "").slice(0, 500),
						),
					},
				};
			} catch (e) {
				return { body: { error: String((e as Error)?.message ?? e), code: stopOf(e) }, status: 502 };
			}
		})(),
	);
}
