import type { Note } from "#lib/notebook/types.ts";
import { noteFaces } from "#lib/review/faces.ts";
import { app, write } from "./app.svelte";
import { collected, collectedId, myWriting, NOTE_EDITS, type NoteEdit, noteEdits, notesPending, sandboxDeck } from "./data";

/*
 * The tour's notebook: while it plays, the notebook's pages read this instead of the learner's own (lib/notebook): the
 * phrases its sandbox collected, then the entries of the piece it finished.
 */
export function sandboxNotebook(): Note[] {
	void app.version;
	const edits = noteEdits();
	const deck = sandboxDeck();
	const read = collected()
		.filter((c) => c.lang === app.lang)
		.reverse()
		.map((c): Note => {
			const id = collectedId(c);
			const examples = (c.examples ?? (c.example ? [c.example] : [])).map((t) => ({ t }));
			return {
				id,
				phrase: c.phrase,
				from: "collected",
				where: "",
				due: true,
				gloss: c.meaning,
				register: c.register as Note["register"],
				examples,
				sentence: c.sentence,
				marked: c.marked,
				card: deck.find((d) => d.id === id),
			};
		});
	const own = myWriting()
		.filter((w) => w.finishedAt && !notesPending(w))
		.flatMap((w) =>
			(w.learned ?? []).map(
				(l, i): Note => ({
					id: `o-${w.id}-${i}`,
					phrase: l.note?.phrase ?? l.text,
					from: "own",
					where: w.title,
					whereHref: `/w/${w.id}`,
					before: l.before,
					final: l.final,
					due: false,
					next: 1,
					gloss: l.note?.meaning ?? "",
					usage: l.note?.usage,
					examples: l.note?.examples,
				}),
			),
		);
	return [...read, ...own]
		.filter((n) => !edits[n.id]?.deleted)
		.map((n) => ({ ...n, phrase: edits[n.id]?.phrase ?? n.phrase, gloss: edits[n.id]?.gloss ?? n.gloss }))
		.map((n) => ({ ...n, card: n.card ?? noteFaces({ ...n, kind: n.from })[0] }));
}

export function editSandboxNote(id: string, edit: NoteEdit) {
	write(NOTE_EDITS, { ...noteEdits(), [id]: { ...noteEdits()[id], ...edit } });
	app.touch();
}
