import type { Face } from "#lib/review/faces.ts";
import { app, read, sandboxed, tx, write } from "./app.svelte";
import { foldCopies } from "./fold";

/* ---------- Sites a piece can be for, with their cover colours (light stamp, dark band) and drawing ---------- */
export type SiteArt = "quill" | "bubble" | "letter" | "hash" | "chat" | "cards";
export const SITES: Record<string, { tone: string; deep: string; art: SiteArt }> = {
	AO3: { tone: "#ebcece", deep: "#5c2f2b", art: "quill" },
	Reddit: { tone: "#e3dacc", deep: "#6a4a2c", art: "bubble" },
	Email: { tone: "#cde2fb", deep: "#2f4660", art: "letter" },
	Discord: { tone: "#dfdbfd", deep: "#3a3955", art: "hash" },
	iMessage: { tone: "#bcd1ca", deep: "#33483f", art: "chat" },
	Translate: { tone: "#cbcadb", deep: "#4a4458", art: "cards" },
};
export const siteOf = (name: string | undefined) =>
	SITES[name ?? ""] ??
	SITES[
		Object.keys(SITES).find((k) =>
			String(name ?? "")
				.toLowerCase()
				.includes(k.toLowerCase()),
		) ?? "Email"
	];

/* ---------- The learner's writing ---------- */
/** What the home page hands the session page, and what reopening a piece hands it again. */
export type Handoff = {
	text: string;
	background?: string;
	source?: string;
	lang: string;
	learner: string;
	feedback: string;
	model?: string;
	grader?: string;
	cache?: string;
	pieceId?: string;
};
export type Writing = {
	id: string;
	title: string;
	site: string;
	lang?: string;
	/** Stand-ins say when in words; real pieces carry a timestamp. */
	when?: "today" | "yesterday" | "mon" | "last";
	at?: number;
	open?: boolean;
	state?: "posted" | "revised";
	handoff?: Handoff;
	/** The scenario it answers, when it came from one. */
	scenarioId?: string;
	/** What the finished session left (the piece's page shows it). */
	result?: PieceResult;
	/** The follow-up: whether the learner says they posted it, and when they were last asked. */
	posted?: "yes" | "not-yet" | "no";
	askedAt?: number;
	/** Written again from memory a few days on (the follow-up), and when. */
	again?: { text: string; at: number };
};
/** One thing the learner worked out in the session: the phrase they settled on, and whether they found it themselves. */
/** A notebook entry's body, written when the piece is finished (src/session/calls.ts notesFor). */
export type NoteBody = { phrase: string; meaning: string; usage: string; examples: { t: string; n: string }[] };
/** text: the tutor's pattern; before: what the learner first wrote there; final: what they settled on. */
/** was: for a pass-1 change, just the words it replaced (before and final are then its whole sentence). */
export type Learned = { text: string; own: boolean; before?: string; final?: string; was?: string; note?: NoteBody };
export type PieceResult = {
	original: string;
	final: string;
	/** The reader's reaction to the final version. */
	closing: string;
	reader: string;
	learned: Learned[];
	/**
	 * While the notebook entries are being chosen and written (since when): `learned` meanwhile holds what pass 2
	 * reworked, which stands if the call fails or the page was left before it came back.
	 */
	notesPending?: number;
	/** What the final check still flagged, and what pass 2 left alone. */
	leftovers: { quote: string; note: string }[];
	/** A translation's text as it was first written, shown beside the learner's final version. */
	authentic?: string;
	finishedAt: number;
};
/** Whether a piece's notebook entries are still on their way (a call takes seconds; after two minutes it is given up). */
export const notesPending = (r: PieceResult | undefined, now = Date.now()) => !!r?.notesPending && now - r.notesPending < 120_000;
const STAND_INS: Record<string, Writing[]> = {
	en: [
		{ id: "w1", title: "Reply to the author of “Long Way Home”", site: "AO3", when: "today", open: true, scenarioId: "ao3-fic" },
		{
			id: "w2",
			title: "Ask r/WarriorCats why StarClan never came",
			site: "Reddit",
			when: "yesterday",
			state: "posted",
			posted: "yes",
			result: {
				original:
					"I have a question that I can't understand for a long time. When the Clans were at the Moonstone and the sky is overcast, StarClan didn't show up. Darktail went really miserable and furious for that, he think StarClan abandoned them.\n\nBut I think it is not StarClan's fault, maybe the clouds alone explain it?",
				final:
					"Here's something I've never quite understood. When the Clans went to the Moonstone on an overcast night, StarClan didn't show up. It left Darktail miserable and furious, and he decided StarClan had abandoned them.\n\nBut I don't think that was StarClan's fault. Couldn't the clouds alone explain it?",
				closing:
					"Ooh, the clouds theory is actually solid. In the books the Moonstone only works when moonlight hits it, so an overcast night would block it anyway. Nice catch.",
				reader: "u/frostkit",
				learned: [
					{ text: "it left him miserable and furious", own: true, before: "he went really miserable and furious for that" },
					{ text: "Here's something I've never quite understood", own: false, before: "I have a question that I can't understand for a long time" },
					{ text: "Couldn't the clouds alone explain it?", own: true, before: "maybe the clouds alone explain it?" },
				],
				leftovers: [{ quote: "on an overcast night", note: "Fine as it is; “under a cloudy sky” would sound more like the books." }],
				finishedAt: Date.now() - 864e5,
			},
		},
		{
			id: "w3",
			title: "Ask Professor Lin for a week's extension",
			site: "Email",
			when: "mon",
			state: "revised",
			scenarioId: "email-extension",
			result: {
				original:
					"Dear Professor Lin,\n\nI want to ask if I can have one more week for the essay. Because my grandmother is in hospital and I go there every day.\n\nThank you,\nMaple",
				final:
					"Dear Professor Lin,\n\nWould it be possible to have one more week for the comparative essay? My grandmother is in hospital and I've been visiting her every day, so I haven't been able to give it the time it needs.\n\nThank you for considering it,\nMaple",
				closing: "Of course. I'm sorry to hear about your grandmother. Take until next Friday, and let me know if you need anything else.",
				reader: "Prof. Hannah Lin",
				learned: [
					{ text: "Would it be possible to have", own: false, before: "I want to ask if I can have" },
					{ text: "I've been visiting her every day", own: true, before: "I go there every day" },
				],
				leftovers: [],
				finishedAt: Date.now() - 3 * 864e5,
			},
		},
		{
			id: "w4",
			title: "Tell #book-club why the ending worked",
			site: "Discord",
			when: "last",
			state: "posted",
			posted: "yes",
			scenarioId: "discord-ending",
			result: {
				original:
					"i'm with theo actually\nthe letters in ch 9 is not just setup, she already forgive him there, she just don't say it\nso the ending is only her saying it loud",
				final:
					"i'm with theo actually\nthe letters in ch 9 aren't just setup, she's already forgiven him there, she just doesn't say it\nso the ending is just her saying it out loud",
				closing: "ok that's... a good point. the letter where she keeps his drawing",
				reader: "juniper",
				learned: [
					{ text: "she's already forgiven him", own: true, before: "she already forgive him" },
					{ text: "saying it out loud", own: false, before: "saying it loud" },
				],
				leftovers: [],
				finishedAt: Date.now() - 6 * 864e5,
			},
		},
		{
			id: "w5",
			title: "Thank Sam for the birthday playlist",
			site: "iMessage",
			when: "last",
			state: "revised",
			scenarioId: "imessage-thanks",
			result: {
				original: "omg sam thank you!!\nthe 4th song make me cry on the bus, how you know i love that band\nthe name is so weird but correct lol",
				final:
					"omg sam thank you!!\nthe 4th song made me cry on the bus, how did you know i love that band\nthe name is so weird but so accurate lol",
				closing: "HAHA i knew it. happy birthday you dramatic bus crier 💛",
				reader: "Sam",
				learned: [
					{ text: "how did you know", own: true, before: "how you know" },
					{ text: "so weird but so accurate", own: false, before: "so weird but correct" },
				],
				leftovers: [],
				finishedAt: Date.now() - 8 * 864e5,
			},
		},
	],
};
export const WRITING_KEY = "myWriting";
/** The learner's pieces in the language being worked in, newest first: theirs from this device, then the stand-ins
 *  (with whatever this device recorded about them: posted, written again). */
export function myWriting(): Writing[] {
	void app.version;
	const stored = read<Writing[]>(WRITING_KEY, []);
	// The tour shows only its own stand-ins (lib/components/tour/content.ts), a few, so nothing crowds them.
	const stand = sandboxed() ? [] : (STAND_INS[app.lang] ?? []);
	const ids = new Set(stand.map((w) => w.id));
	const real = stored.filter((w) => !ids.has(w.id) && w.lang === app.lang).sort((x, y) => (y.at ?? 0) - (x.at ?? 0));
	return [...real, ...stand.map((w) => ({ ...w, ...stored.find((x) => x.id === w.id), at: w.at }))];
}
/** One piece by its id, in whichever language it was written: a link to it works from any workspace. */
export function writingById(id: string): Writing | undefined {
	void app.version;
	const stored = read<Writing[]>(WRITING_KEY, []);
	const stand = sandboxed()
		? undefined
		: Object.values(STAND_INS)
				.flat()
				.find((w) => w.id === id);
	const own = stored.find((w) => w.id === id);
	return stand ? { ...stand, ...own, at: stand.at } : own;
}
export function tidyWriting() {
	renameQuests();
	const all = read<Writing[]>(WRITING_KEY, []);
	// Before a piece kept its id when the learner went back into it, every return filed a new copy (2026-11-06).
	const folded = foldCopies(
		all,
		new Set(
			Object.values(STAND_INS)
				.flat()
				.map((w) => w.id),
		),
	);
	if (folded.length < all.length) {
		write(WRITING_KEY, folded);
		app.touch();
	}
}
/** What admins write is called a scenario everywhere since 2026-11-09; what this device kept under the old word
 *  (a piece's link to it, the handoff to reopen it, a plan written before it) is moved to the new one, once. */
function renameQuests() {
	type Old = Writing & { questId?: string; handoff?: Handoff & { quest?: unknown } };
	const all = read<Old[]>(WRITING_KEY, []);
	let moved = false;
	for (const w of all) {
		if (w.questId !== undefined) {
			w.scenarioId ??= w.questId;
			delete w.questId;
			moved = true;
		}
		if (w.handoff && "quest" in w.handoff) {
			(w.handoff as Record<string, unknown>).scenario ??= w.handoff.quest;
			delete w.handoff.quest;
			moved = true;
		}
	}
	if (moved) write(WRITING_KEY, all);
	if (typeof localStorage === "undefined") return;
	for (const k of Object.keys(localStorage)) {
		if (!k.startsWith("questPlan:")) continue;
		const to = `scenarioPlan:${k.slice("questPlan:".length)}`;
		if (localStorage.getItem(to) === null) localStorage.setItem(to, localStorage.getItem(k) ?? "");
		localStorage.removeItem(k);
	}
}
export function recordWriting(entry: Partial<Writing> & { id: string }) {
	const all = read<Writing[]>(WRITING_KEY, []);
	const at = all.findIndex((w) => w.id === entry.id);
	if (at >= 0) all[at] = { ...all[at], ...entry };
	else
		all.push(
			Object.values(STAND_INS)
				.flat()
				.some((w) => w.id === entry.id)
				? (entry as Writing)
				: { title: "", site: "", at: Date.now(), ...entry },
		);
	write(WRITING_KEY, all);
	app.touch();
}
/** When a piece was last touched, as a list says it: today, yesterday, or the date. */
export function whenOf(w: Writing): string {
	if (!w.at) return tx(`when_${w.when}`);
	const days = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(w.at).setHours(0, 0, 0, 0)) / 864e5);
	return days === 0
		? tx("when_today")
		: days === 1
			? tx("when_yesterday")
			: new Intl.DateTimeFormat(app.lang, { month: "short", day: "numeric" }).format(w.at);
}
export const HANDOFF_KEY = "rehearsal:handoff";
export const COLLECT_KEY = "rehearsal:collect";

/* ---------- Review: two kinds of card, by where the phrase came from ---------- */
/* From the learner's own writing: their sentence with the part they reworked marked, to say again. From reading: the
   sentence they met it in with the words they highlighted blanked, and what it means as the cue. Either way they answer
   before they see it. Cues are the tutor's to say, in the tutor's language. */
type Local = Record<string, string>;
type DeckCard =
	| { id: string; kind: "own"; where: string; text: string; part: string; answer: string; also: string[]; why: Local }
	| { id: string; kind: "collected"; where: string; text: string; answer: string; cue: Local | string; phrase?: string };
const DECK: Record<string, DeckCard[]> = {
	en: [
		{
			id: "r1",
			kind: "own",
			where: "your Reddit post",
			text: "When StarClan didn't show up, he went really miserable and furious for that.",
			part: "he went really miserable and furious for that",
			answer: "it left him miserable and furious",
			also: ["it left him furious and miserable"],
			why: { en: "Let the event be the subject: it did something to him.", "zh-CN": "让事件做主语：这件事让他怎样。" },
		},
		{
			id: "r2",
			kind: "collected",
			where: "r/WarriorCats",
			text: "For what it's worth, I always thought Bluestar knew more than she let on.",
			answer: "For what it's worth",
			cue: { en: "Offering your opinion without pushing it", "zh-CN": "表达看法但不强加于人" },
		},
		{
			id: "r3",
			kind: "own",
			where: "your email to a professor",
			text: "I want to ask if I can have one more week for the essay.",
			part: "I want to ask if I can have",
			answer: "Would it be possible to have",
			also: ["would it be possible to get", "could I possibly have"],
			why: { en: "A request opens politely with a question, not with what you want.", "zh-CN": "提请求用问句开头更礼貌，而不是先说“我想要”。" },
		},
		{
			id: "r4",
			kind: "own",
			where: "your AO3 comment",
			text: "This chapter made me very very sad, in a good way.",
			part: "made me very very sad",
			answer: "wrecked me",
			also: ["absolutely wrecked me", "destroyed me"],
			why: { en: "Fans say a chapter wrecked them: strong, casual, and a compliment.", "zh-CN": "粉丝会说一章 wrecked me：强烈、口语，而且是夸奖。" },
		},
	],
};
/** A card review asks (its front: lib/review/faces.ts), with why it is said this way for its back. */
export type ReviewCard = Face & { id: string; kind: "own" | "collected"; where: string; why?: string; phrase?: string };
export type Collected = {
	phrase: string;
	meaning: string;
	register?: string;
	examples?: string[];
	example?: string;
	why?: string;
	lang: string;
	at: number;
	sentence?: string;
	marked?: string;
	passage?: string;
	batch?: string;
};
export const COLLECTED_KEY = "collected";
export const collected = (): Collected[] => {
	void app.version;
	return read<Collected[]>(COLLECTED_KEY, []);
};
/* ---------- Notebook entries the learner edited or deleted (/notebook/<id>), laid over what they came from ---------- */
export type NoteEdit = { phrase?: string; gloss?: string; deleted?: boolean };
export const NOTE_EDITS = "noteEdits";
export const noteEdits = () => read<Record<string, NoteEdit>>(NOTE_EDITS, {});
/** A collected phrase's id: stable across visits, from the reading it was kept in and the words kept. */
export function collectedId(c: Collected) {
	let h = 5381;
	for (const ch of `${c.batch ?? c.at}|${c.phrase}`) h = ((h << 5) + h + ch.charCodeAt(0)) >>> 0;
	return `c-${h.toString(36)}`;
}
/** Which stand-in note each stand-in card asks. */
export const CARD_NOTE: Record<string, string> = { r1: "n1", r2: "n4", r3: "n3", r4: "n2" };

export function reviewDeck(): ReviewCard[] {
	void app.version;
	const edits = noteEdits();
	const pick = (o: Local | string | undefined) => (typeof o === "string" ? o : (o?.[app.tutor] ?? o?.en ?? ""));
	const mine = collected()
		.filter((c) => c.lang === app.lang && c.sentence && c.marked && c.sentence.includes(c.marked))
		.map((c): ReviewCard => {
			const id = collectedId(c);
			return {
				id,
				kind: "collected",
				where: tx("nbSomethingRead"),
				text: c.sentence as string,
				answer: c.marked as string,
				cue: edits[id]?.gloss ?? c.meaning,
				phrase: edits[id]?.phrase ?? c.phrase,
			};
		});
	const stand = (sandboxed() ? [] : (DECK[app.lang] ?? [])).map((c): ReviewCard => {
		const e = edits[CARD_NOTE[c.id]];
		if (c.kind === "collected") return { ...c, cue: e?.gloss ?? pick(c.cue) };
		// An own card is their sentence as they settled it, the phrase blanked, cued by what they first wrote there; an
		// edited phrase is the answer from then on.
		const answer = e?.phrase ?? c.answer;
		return {
			id: c.id,
			kind: "own",
			where: c.where,
			text: c.text.replace(c.part, answer),
			answer,
			also: c.also,
			was: c.part,
			why: e?.gloss ?? pick(c.why),
		};
	});
	// A deleted entry leaves review too.
	return [...stand, ...mine].filter((c) => !edits[CARD_NOTE[c.id] ?? c.id]?.deleted);
}

/* ---------- The week: which days the learner practised ---------- */
/*
 * A day counts (its glass is poured) only when the learner both learned something (finished a piece, a scenario, a
 * translation, or wrote a piece again from memory) and cleared their reviews (finished a sitting, or had nothing due), as
 * the main app's streak rule: a completion and an empty queue on the same day. One of the two alone is a half day, its
 * glass turned upright and empty so the other half is one step away, never counted. Stand-in history for the days before today;
 * today is real on this device.
 */
export type DayKind = "full" | "learned" | "reviewed" | "none" | "later";
const PRACTICE = "practiceDays";
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
// Stored as "both", "learned" or "reviewed". Days kept before the rule changed said "full" (a piece finished) or
// "light" (only reviewed).
const kindOf = (k: string | undefined): DayKind | undefined =>
	k === "both" ? "full" : k === "learned" || k === "full" ? "learned" : k === "reviewed" || k === "light" ? "reviewed" : undefined;
/** Credits today with one half; returns whether that changed anything (and leaves a note for the shell to show it). */
export function practised(what: "learned" | "reviewed"): boolean {
	const all = read<Record<string, string>>(PRACTICE, {});
	const was = kindOf(all[dayKey()]) ?? "none";
	const learned = what === "learned" || was === "learned" || was === "full";
	// Nothing due means the reviews are as done as they can be.
	const reviewed = what === "reviewed" || was === "reviewed" || was === "full" || reviewDeck().length === 0;
	const kind: DayKind = learned && reviewed ? "full" : learned ? "learned" : "reviewed";
	if (kind === was) return false;
	all[dayKey()] = kind === "full" ? "both" : kind;
	write(PRACTICE, all);
	sessionStorage.setItem("weekEarned", kind);
	app.touch();
	return true;
}
export function weekDays(now = new Date()) {
	void app.version;
	const mon = (now.getDay() + 6) % 7;
	const all = read<Record<string, string>>(PRACTICE, {});
	return Array.from({ length: 7 }, (_, i) => {
		const d = new Date(now);
		d.setDate(now.getDate() - mon + i);
		const real = kindOf(all[dayKey(d)]);
		const kind: DayKind = i > mon ? "later" : (real ?? (i === mon - 2 ? "full" : i === mon - 3 ? "learned" : i === mon - 1 ? "reviewed" : "none"));
		return { i, today: i === mon, kind };
	});
}
export const weekCount = () => weekDays().filter((d) => d.kind === "full").length;
/** The whole history, week by week (Monday first), for the profile: this week is real; the weeks before are a
    stand-in, drawn from a fixed seed so the page is the same on every visit. */
export function historyWeeks(weeks = 26, now = new Date()) {
	void app.version;
	const mon = (now.getDay() + 6) % 7;
	const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - mon);
	let seed = 7;
	const rand = () => {
		seed = (seed * 16807) % 2147483647;
		return (seed - 1) / 2147483646;
	};
	const out: { start: Date; days: DayKind[] }[] = [];
	for (let w = weeks - 1; w >= 0; w--) {
		const s = new Date(start);
		s.setDate(start.getDate() - w * 7);
		// The learner started 19 weeks ago, and got steadier.
		const busy = w > 18 ? 0 : 0.3 + (18 - w) * 0.02;
		// Last week met the aim, so the run is alive while this one is under way.
		const days: DayKind[] =
			w === 0
				? weekDays(now).map((d) => d.kind)
				: w === 1
					? ["full", "reviewed", "full", "learned", "full", "none", "full"]
					: Array.from({ length: 7 }, () => (rand() < busy ? "full" : rand() < 0.25 && w <= 18 ? (rand() < 0.5 ? "learned" : "reviewed") : "none"));
		out.push({ start: s, days });
	}
	return out;
}
export const todayKind = () => weekDays().find((d) => d.today)?.kind ?? "none";

/* ---------- Follow-up: the shelf's second slot ---------- */
/* One card at most, for one piece: first whether it was posted (a day after it was finished, not again for a day after
   "not yet"), then, three days on, writing it again from memory. */
export type FollowUp = { kind: "posted" | "again"; w: Writing };
export function followUp(now = Date.now()): FollowUp | undefined {
	const done = myWriting().filter((w) => w.result);
	// A scenario's piece was sent in the simulation already: nothing to ask about posting.
	const ask = done.find((w) => !w.scenarioId && (!w.posted || (w.posted === "not-yet" && now - (w.askedAt ?? 0) > 864e5)));
	if (ask && !(ask.posted === "not-yet")) return { kind: "posted", w: ask };
	const again = done.find((w) => !w.again && now - (w.result as PieceResult).finishedAt >= 3 * 864e5 - 36e5);
	if (again) return { kind: "again", w: again };
	return ask ? { kind: "posted", w: ask } : undefined;
}
