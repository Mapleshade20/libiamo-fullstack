import { z } from "zod";
import type { Learned, NoteBody } from "#lib/writing/types.ts";

/*
 * What a finished piece keeps for the notebook. When the revision ends the page says what was worked out: the pass-2
 * parts the learner reworked (theirs first, then those given) and the pass-1 changes they did not make unaided. The
 * notes call (RevisionSession.notes) says which earn an entry; until it has, what pass 2 reworked stands in.
 */
const text = (max: number) => z.string().max(max);
export const NoteAsk = z.object({
	items: z
		.array(z.object({ id: text(40), orig: text(4000), final: text(4000), own: z.boolean().default(false) }))
		.max(40)
		.default([]),
	p1: z.array(text(40)).max(200).default([]),
});
export type NoteAsk = z.infer<typeof NoteAsk>;

export const StandIn = z
	.array(z.object({ text: text(400), own: z.boolean(), before: text(4000).optional(), final: text(4000).optional() }))
	.max(6)
	.default([]);

/** The entries in the order the page lists them (rebuilt parts, those given, pass 1's), at most six. */
export function learnedFrom(ask: NoteAsk, notes: Record<string, { note: NoteBody | null; orig: string; final: string; was?: string }>): Learned[] {
	const order = [...ask.items.map((x) => ({ id: x.id, own: x.own })), ...ask.p1.map((id) => ({ id, own: false }))];
	return order
		.flatMap(({ id, own }) => {
			const n = notes[id];
			return n?.note ? [{ text: n.note.phrase, own, before: n.orig, final: n.final, ...(n.was ? { was: n.was } : {}), note: n.note }] : [];
		})
		.slice(0, 6);
}
