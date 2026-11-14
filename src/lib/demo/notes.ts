import { type Face, facesOf } from "#lib/review/faces.ts";
import { app, sandboxed, tx, write } from "./app.svelte";
import {
	CARD_NOTE,
	collected,
	collectedId,
	myWriting,
	NOTE_EDITS,
	type NoteEdit,
	noteEdits,
	notesPending,
	type ReviewCard,
	reviewDeck,
} from "./data";

/*
 * The notebook's entries: phrases the learner reworked in their own writing, and phrases they collected from reading.
 * Each has its own page (/notebook/<id>): where it came from, how review asks it, and the way to correct or delete it
 * (the main app's /review/manage, folded in). Stand-ins for the main app's notes, plus what this device collected and
 * finished; what a phrase means is the tutor's to say, so it comes in the tutor's language.
 */
export type Note = {
	id: string;
	phrase: string;
	from: "own" | "collected";
	/** Where it came from, as the list says it, and a link there when the demo has the page. */
	where: string;
	whereHref?: string;
	due: boolean;
	/** Days until it is next asked, when not due. */
	next?: number;
	gloss: string;
	register?: string;
	/** How it is used (own entries, from the tutor), and sentences using it, with their translation when there is one. */
	usage?: string;
	examples?: { t: string; n?: string }[];
	/** Own: what the learner first wrote there, and the words they settled on. Collected: the sentence it was read in. */
	before?: string;
	final?: string;
	sentence?: string;
	marked?: string;
	/** The card review asks next: its own when it is in today's deck, else the first one it will get (lib/review/faces.ts). */
	card?: ReviewCard | Face;
};
type Local = Record<string, string>;
type Stand = Omit<Note, "gloss" | "card"> & { gloss: Local };
const STAND: Record<string, Stand[]> = {
	en: [
		{
			id: "n1",
			phrase: "it left him miserable",
			from: "own",
			where: "your Reddit post",
			whereHref: "/w/w2",
			before: "he went really miserable and furious for that",
			due: true,
			gloss: { en: "The event as the subject: what it did to him.", "zh-CN": "让事件做主语：这件事让他如何。" },
		},
		{
			id: "n2",
			phrase: "wrecked me",
			from: "own",
			where: "your AO3 comment",
			before: "made me very very sad",
			due: true,
			gloss: { en: "Casual: a scene hit you hard emotionally.", "zh-CN": "口语：某一幕让你情绪崩了。" },
		},
		{
			id: "n3",
			phrase: "would it be possible to",
			from: "own",
			where: "your email to a professor",
			whereHref: "/w/w3",
			before: "I want to ask if I can have",
			due: true,
			gloss: { en: "A polite way in to a request.", "zh-CN": "提请求时礼貌的开头。" },
		},
		{
			id: "n4",
			phrase: "for what it's worth",
			from: "collected",
			where: "r/WarriorCats",
			sentence: "For what it's worth, I always thought Bluestar knew more than she let on.",
			marked: "For what it's worth",
			register: "casual",
			due: true,
			gloss: { en: "Offering an opinion without pushing it.", "zh-CN": "表达看法但不强加于人。" },
		},
		{
			id: "n5",
			phrase: "a slow burn",
			from: "collected",
			where: "an AO3 tag",
			sentence: "Tags: slow burn, friends to lovers, eventual happy ending",
			marked: "slow burn",
			register: "casual",
			due: false,
			next: 6,
			gloss: { en: "A story whose romance builds slowly.", "zh-CN": "感情线慢热的故事。" },
		},
	],
};

export function notebook(): Note[] {
	void app.version;
	const edits = noteEdits();
	const deck = reviewDeck();
	const cardFor = (id: string) => deck.find((c) => (CARD_NOTE[c.id] ?? c.id) === id);
	const pick = (o: Local) => o[app.tutor] ?? o.en ?? Object.values(o)[0] ?? "";
	// What this device collected comes first, newest first; then what it finished; then the stand-ins.
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
				where: tx("nbSomethingRead"),
				due: true,
				gloss: c.meaning,
				register: c.register,
				examples,
				sentence: c.sentence,
				marked: c.marked,
				card: cardFor(id),
			};
		});
	const stands = new Set(["w1", "w2", "w3", "w4", "w5"]);
	const own = myWriting()
		// A piece whose entries are on their way has none yet: the stand-in list would come and go.
		.filter((w) => w.result && !stands.has(w.id) && !notesPending(w.result))
		.flatMap((w) =>
			(w.result?.learned ?? []).map(
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
	const stand = (sandboxed() ? [] : (STAND[app.lang] ?? [])).map((n): Note => ({ ...n, gloss: pick(n.gloss), card: cardFor(n.id) }));
	return [...read, ...own, ...stand]
		.filter((n) => !edits[n.id]?.deleted)
		.map((n) => ({ ...n, phrase: edits[n.id]?.phrase ?? n.phrase, gloss: edits[n.id]?.gloss ?? n.gloss }))
		.map((n) => ({ ...n, card: n.card ?? facesOf(n)[0] }));
}
export const noteById = (id: string) => notebook().find((n) => n.id === id);

export function editNote(id: string, edit: NoteEdit) {
	write(NOTE_EDITS, { ...noteEdits(), [id]: { ...noteEdits()[id], ...edit } });
	app.touch();
}
