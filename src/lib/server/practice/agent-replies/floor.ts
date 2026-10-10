/**
 * The floor of a group scene: who posts now and what they do. Code draws it, not the model: left
 * alone, a model makes every turn orbit the learner, agree with them, and sound like itself. The
 * draw is seeded, so a stored recipe input re-renders the same prompt.
 *
 * Two layers. When the learner has just posted, a few people with a reason answer them: whoever
 * they answered or named, the owner of the place, people nearby, and at most one stranger. The
 * rest of the scene (people's own business) shows only where the learner can see it: in a chat,
 * and around the learner's corner of a comment thread, never in branches they have not read.
 */

import type { UiVariant } from "$lib/constants";
import { passersBy } from "$lib/practice/names";
import type { Scene } from "$lib/practice/scene";
import type { TranscriptEntry } from "$lib/server/practice/prompt-context";

type Weighted<T> = Array<[T, number]>;

/** Someone who posts now: what they do (`does` names the message they answer), their take, length and habits. */
export type Presence = {
	name: string;
	does: string;
	/** Their take on what they answer. */
	attitude?: string;
	/** Rough length of what they write, in words. */
	words?: string;
	/** How they write, stable for the person; people who already posted write as they did. */
	habits?: string;
};

export type SceneMoment = {
	around: Presence[];
	/** Observations about the conversation the cast would react to. */
	notes: string[];
};

/** Takes of people who have not posted yet, by platform; the platform's norms shape them. */
const ATTITUDES: Partial<Record<UiVariant, Weighted<string>>> = {
	reddit: [
		["agrees, briefly or with a new angle", 0.2],
		["pushes back or disagrees", 0.25],
		["tells an experience of their own", 0.15],
		["corrects or nitpicks a detail", 0.1],
		["jokes about it", 0.1],
		["asks something they want to know", 0.1],
		["makes a plain remark", 0.1],
	],
	discord: [
		["agrees, briefly", 0.15],
		["pushes back", 0.2],
		["jokes or riffs on it", 0.2],
		["tells something of their own", 0.1],
		["reacts in a word or an emoji", 0.2],
		["asks something", 0.1],
		["nitpicks", 0.05],
	],
	imessage: [
		["teases", 0.2],
		["goes along with it", 0.2],
		["pushes their own preference", 0.2],
		["sorts out logistics: dates, money, who does what", 0.2],
		["reacts in a word or an emoji", 0.15],
		["drifts to something else", 0.05],
	],
	apple_mail: [
		["agrees and adds a practical point", 0.3],
		["raises a constraint or politely disagrees", 0.3],
		["answers what was asked", 0.25],
		["asks for a detail", 0.15],
	],
	// AO3 readers praise; they do not argue with each other or the author.
	ao3: [
		["gushes about a moment nobody here has mentioned yet", 0.3],
		["quotes a line they loved", 0.1],
		["asks about the next chapter, the author's plans, or a canon detail", 0.15],
		["relates it to their own feelings or experience", 0.15],
		["keysmash or all-caps delight", 0.1],
		["shares a headcanon or a moment from canon it reminds them of", 0.2],
	],
};

/** For people who already posted: reactions measured against their own stance, so nobody switches sides. */
const STANCED: Weighted<string> = [
	["keeps to their own view", 0.4],
	["grants a small point, keeps their view", 0.1],
	["tells an experience of their own", 0.15],
	["jokes about it", 0.1],
	["asks something they want to know", 0.1],
	["reacts in a word or two", 0.15],
];

const AUTHOR_THANKS: Weighted<string> = [
	["thanks them, warmly and briefly", 0.6],
	["thanks them and shares a little about writing it", 0.3],
	["answers what they asked", 0.1],
];

const LENGTHS: Partial<Record<UiVariant, Weighted<string>>> = {
	discord: [
		["1-4", 0.35],
		["5-12", 0.45],
		["13-30", 0.2],
	],
	imessage: [
		["1-4", 0.4],
		["5-12", 0.45],
		["13-25", 0.15],
	],
	reddit: [
		["1-8", 0.25],
		["9-25", 0.4],
		["26-60", 0.25],
		["60-120", 0.1],
	],
	ao3: [
		["5-20", 0.35],
		["20-60", 0.45],
		["60-150", 0.2],
	],
};

/** How many people answer the learner's message. */
const RESPONDERS: Partial<Record<UiVariant, Weighted<number>>> = {
	reddit: [
		[1, 0.7],
		[2, 0.25],
		[3, 0.05],
	],
	ao3: [
		[1, 0.9],
		[2, 0.1],
	],
	discord: [
		[1, 0.55],
		[2, 0.45],
	],
	imessage: [
		[1, 0.55],
		[2, 0.45],
	],
	apple_mail: [
		[1, 0.5],
		[2, 0.4],
		[3, 0.1],
	],
};

/** Chance that someone also carries on their own business right after the learner posts. */
const WORLD_ON_REPLY: Partial<Record<UiVariant, number>> = { reddit: 0.3, ao3: 0.3, discord: 0.35, imessage: 0.25 };

/** How many participants take up a learner's message; one-to-one scenes always take exactly one taker (callers enforce it). */
export function drawTakerCount(ui: UiVariant, seed: number): number {
	return pick(RESPONDERS[ui] ?? [[1, 1]], random(seed)());
}

/** Messages when time passes without the learner. */
const WORLD_WHEN_IDLE: Weighted<number> = [
	[1, 0.5],
	[2, 0.35],
	[3, 0.15],
];

const HABITS = [
	"lowercase, barely any punctuation",
	"proper sentences, dry",
	"casual, some slang and abbreviations",
	"blunt, no softeners",
	"chatty and a bit rambling",
	"terse, sometimes sarcastic",
	"friendly, now and then an emoji",
];

function random(seed: number): () => number {
	let state = seed >>> 0 || 1;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function pick<T>(options: Weighted<T>, roll: number): T {
	const total = options.reduce((sum, [, weight]) => sum + weight, 0);
	let left = roll * total;
	for (const [value, weight] of options) if ((left -= weight) < 0) return value;
	return options[options.length - 1][0];
}

function hash(value: string): number {
	let result = 0;
	for (const char of value) result = (result * 31 + char.charCodeAt(0)) >>> 0;
	return result;
}

/**
 * Whether someone sends a thought as several short messages: as they did in the transcript, else a
 * stable trait of about a third of chat users.
 */
export function sendsBursts(ui: UiVariant, name: string, entries: TranscriptEntry[]): boolean {
	if (ui !== "discord" && ui !== "imessage") return false;
	return entries.some((entry, index) => index > 0 && entry.author === name && entries[index - 1].author === name) || (hash(name) >>> 4) % 3 === 0;
}

const THREADED = new Set<UiVariant>(["reddit", "ao3"]);

/** A presence for someone who posts now: their take, length and habits, drawn once. */
function presenceOf(ui: UiVariant, owner: string, posted: Set<string>, draw: () => number, name: string, does: string): Presence {
	const attitudes =
		ui === "ao3" && name === owner ? AUTHOR_THANKS : posted.has(name) && ui !== "ao3" ? STANCED : (ATTITUDES[ui] ?? ATTITUDES.reddit ?? []);
	const lengths = LENGTHS[ui];
	return {
		name,
		does,
		attitude: pick(attitudes, draw()),
		...(lengths ? { words: pick(lengths, draw()) } : {}),
		...(posted.has(name) ? {} : { habits: HABITS[hash(name) % HABITS.length] }),
	};
}

/** A thread entry's branch: its ancestors and everything answering them. */
function branchOf(entries: TranscriptEntry[], entry?: TranscriptEntry): TranscriptEntry[] {
	if (!entry) return [];
	const byId = (id?: number) => (id ? entries[id - 1] : undefined);
	const ids = new Set<number>();
	for (let at: TranscriptEntry | undefined = entry; at; at = byId(at.replyTo)) ids.add(at.id);
	return entries.filter((other) => ids.has(other.id) || (other.replyTo !== undefined && ids.has(other.replyTo)));
}

/**
 * The learner's exchange: the anchor and everything answering it, recursively. Ancestors are
 * context, not answerable targets — a sibling sub-thread under the same root is another
 * conversation, never something a take-up of this exchange picks up.
 */
function exchangeOf(entries: TranscriptEntry[], anchor: TranscriptEntry): TranscriptEntry[] {
	const ids = new Set<number>([anchor.id]);
	const exchange: TranscriptEntry[] = [];
	// Transcript ids are chronological, so a child always follows its parent.
	for (const entry of entries) {
		if (entry.replyTo !== undefined && ids.has(entry.replyTo)) {
			ids.add(entry.id);
			exchange.push(entry);
		}
	}
	return [anchor, ...exchange];
}

/** Questions in the recent window no cast member has picked up yet. */
function unpickedNotes(entries: TranscriptEntry[]): string[] {
	const notes: string[] = [];
	for (const entry of entries.slice(-6)) {
		const pickedUp = entries.some((later) => later.id > entry.id && later.role === "cast" && later.author !== entry.author);
		if (asks(entry.text) && !pickedUp && entry.role === "cast") notes.push(`Nobody has picked up #${entry.id} (${entry.author}) yet.`);
	}
	return notes;
}

/**
 * Who has a reason to take up the learner's message, at what weight: the shared machinery of the
 * live moment draw and the async taker allocation. A top-level question on a thread reaches
 * everyone who posted in the opening conversation, at any depth, plus the authors of later
 * top-level cast comments; a branch reply keeps its branch scope.
 */
function replyCandidates(input: {
	ui: UiVariant;
	entries: TranscriptEntry[];
	scene: Scene;
	learnerName: string;
	/** The learner's message being taken up. */
	target: TranscriptEntry;
	addressees?: string[] | null;
	strangers: string[];
	quiet?: string;
	/** An async taker allocation: nearby means the learner's exchange, not the wide branch. */
	allocation?: boolean;
}): { candidates: Map<string, number>; addressed: Set<string>; solo: string | null } {
	const { entries, scene, learnerName, ui } = input;
	const threaded = THREADED.has(ui);
	const owner = scene.counterpart.name;
	const byId = (id?: number) => (id ? entries[id - 1] : undefined);
	const cast = (list: TranscriptEntry[]) => [...new Set(list.map((entry) => entry.author))].filter((name) => name !== learnerName);
	const addressed = new Set<string>();
	const target = byId(input.target.replyTo);
	if (target && target.author !== learnerName) addressed.add(target.author);
	if (input.addressees) {
		for (const name of input.addressees) if (name !== learnerName) addressed.add(name);
	} else {
		for (const person of scene.cast) if (names(input.target.text, person.name)) addressed.add(person.name);
	}
	const ownerWeight =
		ui === "ao3" ? (!target || target.author === owner ? 6 : 0.5) : ui === "reddit" ? (target ? 0.7 : 1.5) : ui === "apple_mail" ? 2 : 1.2;
	const scope = threaded
		? input.target.replyTo === undefined
			? [...exchangeOf(entries, input.target), ...entries.filter((entry) => entry.opening || entry.replyTo === undefined)]
			: input.allocation
				? exchangeOf(entries, input.target)
				: branchOf(entries, input.target)
		: entries.slice(-6);
	const nearby = cast(scope);
	// Someone who alone answered the learner's last two messages steps back, so it is no duet.
	const session = entries.filter((entry) => !entry.opening);
	const learnerTurns = session.filter((entry) => entry.role === "learner").slice(-3, -1);
	const partners = learnerTurns.map((turn) => {
		const next = session.find((entry) => entry.id > turn.id && entry.role === "learner")?.id ?? Infinity;
		return cast(session.filter((entry) => (threaded ? entry.replyTo === turn.id : entry.id > turn.id && entry.id < next)));
	});
	const solo = partners.length === 2 && partners.every((names) => names.length === 1 && names[0] === partners[0][0]) ? partners[0][0] : null;
	const candidates = new Map<string, number>();
	const consider = (name: string, weight: number) => candidates.set(name, Math.max(candidates.get(name) ?? 0, weight * (name === solo ? 0.3 : 1)));
	for (const name of nearby) consider(name, 1);
	if (input.quiet) consider(input.quiet, 1);
	// Whoever just talked with the learner is the likeliest to carry on.
	for (const name of partners.at(-1) ?? []) consider(name, 2);
	if (owner !== learnerName) consider(owner, ownerWeight);
	// A mail's greeting names someone, yet a reply-all is for everyone.
	for (const name of addressed) consider(name, ui === "apple_mail" ? 2 : 5);
	if (input.strangers.length) consider(input.strangers[0], ui === "reddit" ? 0.8 : 0.4);
	return { candidates, addressed, solo };
}

/**
 * The distinct participants who take up a learner's message, drawn when the taker set is created
 * (inside the submit transaction) from the candidate machinery over the submit-time transcript.
 * A repeat across sets or later messages is a legitimate return; a repeat inside one set is not.
 * `exclude` keeps out participants who already delivered for the message (a manual retry), and a
 * one-to-one scene always takes up as its single counterpart.
 */
export function allocateParticipants(input: {
	ui: UiVariant;
	language: string;
	entries: TranscriptEntry[];
	scene: Scene;
	learnerName: string;
	/** Seeded by the input message id, so the same submit re-renders the same set. */
	seed: number;
	count: number;
	/** The learner's message being taken up. */
	target: TranscriptEntry;
	addressees?: string[] | null;
	exclude?: string[];
}): string[] {
	const { entries, scene, learnerName, ui } = input;
	if (input.count <= 0) return [];
	if (!scene.group) return [scene.counterpart.name];
	const draw = random(input.seed);
	const owner = scene.counterpart.name;
	const posted = new Set(entries.filter((entry) => entry.role === "cast").map((entry) => entry.author));
	const taken = new Set([learnerName, ...scene.cast.map((person) => person.name), ...posted]);
	const strangers = scene.open ? passersBy(ui, input.language, draw, 3, taken) : [];
	// A member who has not spoken yet may be the one who does now, or a quiet group stays a duet.
	const silent = scene.cast.map((person) => person.name).filter((name) => name !== owner && name !== learnerName && !posted.has(name));
	const quiet = silent.length ? silent[Math.floor(draw() * silent.length)] : undefined;
	const { candidates, addressed } = replyCandidates({
		ui,
		entries,
		scene,
		learnerName,
		target: input.target,
		addressees: input.addressees,
		strangers,
		allocation: true,
		quiet,
	});
	const excluded = new Set((input.exclude ?? []).map((name) => name.toLowerCase()));
	for (const name of [...candidates.keys()]) if (excluded.has(name.toLowerCase())) candidates.delete(name);
	// At most one taker who was neither addressed nor the owner: strangers do not crowd a question.
	const participants: string[] = [];
	let loose = 0;
	for (let round = 0; round < input.count && candidates.size; round += 1) {
		const name = pick([...candidates], draw());
		candidates.delete(name);
		const reasoned = addressed.has(name) || name === owner;
		if (!reasoned && loose++ > 0) continue;
		participants.push(name);
	}
	return participants;
}

/** Whether a message ends on a question, in any script. */
const asks = (text: string) => /[?？]\s*\S{0,2}$/u.test(text.trim());

/** Whether a message names someone: an @mention, or a name long enough not to be an ordinary word. */
function names(text: string, name: string): boolean {
	const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return (
		new RegExp(`@${escaped}`, "iu").test(text) ||
		(name.length >= 4 && new RegExp(`(^|[^\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, "iu").test(text))
	);
}

export function drawSceneMoment(input: {
	ui: UiVariant;
	language: string;
	entries: TranscriptEntry[];
	scene: Scene;
	learnerName: string;
	seed: number;
	/**
	 * Whom the learner's latest message is for when it quotes and @mentions nobody, inferred
	 * elsewhere; `[]` is nobody in particular. Without it, names in the text stand in.
	 */
	addressees?: string[] | null;
	/** An async take-up's fixed participant: the moment lists only them (arrival-based replies). */
	participant?: string;
	/** The transcript entry the take-up serves; branch math keys on it, not the newest learner message. */
	target?: TranscriptEntry;
	/** A world moment: the participant carries on their own business rather than answering the learner. */
	world?: boolean;
}): SceneMoment | null {
	const { entries, scene, learnerName, ui } = input;
	if (input.participant !== undefined) return drawTakeUpMoment({ ...input, participant: input.participant });
	if (!scene.group) return null;
	const draw = random(input.seed);
	const threaded = THREADED.has(ui);
	const owner = scene.counterpart.name;
	const posted = new Set(entries.filter((entry) => entry.role === "cast").map((entry) => entry.author));
	const taken = new Set([learnerName, ...scene.cast.map((person) => person.name), ...posted]);
	const strangers = scene.open ? passersBy(ui, input.language, draw, 3, taken) : [];
	// A member who has not spoken yet may be the one who does now, or a quiet group stays a duet.
	const silent = scene.cast.map((person) => person.name).filter((name) => name !== owner && name !== learnerName && !posted.has(name));
	const quiet = silent.length ? silent[Math.floor(draw() * silent.length)] : undefined;
	const around: Presence[] = [];
	const notes: string[] = [];

	const presence = (name: string, does: string): Presence => presenceOf(ui, owner, posted, draw, name, does);
	const post = (name: string, does: string) => {
		if (!around.some((person) => person.name === name)) around.push(presence(name, does));
	};
	const recent = (count: number) => entries.slice(-count).filter((entry) => entry.author !== learnerName);
	const cast = (list: TranscriptEntry[]) => [...new Set(list.map((entry) => entry.author))].filter((name) => name !== learnerName);

	// Someone's own business, where the learner can see it.
	const world = (branch: TranscriptEntry[]) => {
		if (!threaded) {
			const lines = recent(8);
			const focus =
				lines.length && draw() < 0.6
					? pick<TranscriptEntry>(
							lines.map((entry, index) => [entry, index + 1]),
							draw(),
						)
					: undefined;
			const people = [...cast(entries.slice(-20)), ...(quiet ? [quiet] : [])].filter(
				(name) => name !== focus?.author && !around.some((person) => person.name === name),
			);
			const name =
				strangers.length && draw() < 0.12
					? strangers.shift()
					: people.length
						? pick(
								people.map((person) => [person, 1]),
								draw(),
							)
						: undefined;
			if (name) post(name, focus ? `reacts to #${focus.id}` : "carries on their own topic");
			return;
		}
		const others = branch.filter((entry) => entry.author !== learnerName);
		const newcomer = strangers.shift();
		if (others.length && draw() < 0.4) {
			const focus = others[others.length - 1 - Math.floor(draw() * Math.min(3, others.length))];
			const name = cast(branch).find((person) => person !== focus.author && !around.some((p) => p.name === person)) ?? newcomer;
			if (name) post(name, `answers #${focus.id}`);
		} else if (newcomer) post(newcomer, ui === "ao3" ? "a new comment on the work" : "a new top-level comment on the post");
	};

	const session = entries.filter((entry) => !entry.opening);
	const last = entries.at(-1);
	const learnerTurn = last?.role === "learner";
	// The learner's corner of a thread: what their latest message sits in and what answers it.
	const anchor = input.target ?? session.findLast((entry) => entry.role === "learner");
	const branch = threaded ? branchOf(entries, anchor) : entries;

	if (learnerTurn && last) {
		// Who has a reason to answer: whoever the learner answered or named, the owner, people nearby.
		const { candidates, addressed, solo } = replyCandidates({
			ui,
			entries,
			scene,
			learnerName,
			target: last,
			addressees: input.addressees,
			strangers,
			quiet,
		});
		if (solo) notes.push(`${solo} has been ${learnerName}'s only partner lately; others may take it up.`);
		const count = pick(RESPONDERS[ui] ?? [[1, 1]], draw());
		// At most one responder who was neither addressed nor the owner: strangers do not crowd a one-liner.
		let loose = 0;
		for (let round = 0; round < count && candidates.size; round += 1) {
			const name = pick([...candidates], draw());
			candidates.delete(name);
			const reasoned = addressed.has(name) || name === owner;
			if (!reasoned && loose++ > 0) continue;
			if (name === strangers[0]) strangers.shift();
			post(name, `answers #${last.id} (${learnerName})`);
		}
		if (draw() < (WORLD_ON_REPLY[ui] ?? 0)) world(branch);
		if (!last.replyTo && asks(last.text))
			notes.push(`${learnerName}'s question #${last.id} is to everyone: whoever knows answers, the rest carry on.`);
	} else {
		// Time passes: a late answer to the learner if nobody gave one, and people's own business.
		if (threaded && anchor && !session.some((entry) => entry.replyTo === anchor.id) && draw() < 0.5) {
			const name = cast(branchOf(entries, anchor))[0] ?? owner;
			if (name && name !== learnerName) post(name, `answers #${anchor.id} (${learnerName}), late`);
		}
		const count = ui === "apple_mail" ? 1 : pick(WORLD_WHEN_IDLE, draw());
		for (let round = 0; around.length < count && round < count * 2; round += 1) {
			if (ui === "apple_mail") {
				const latest = recent(3).at(-1);
				const name = cast(entries.slice(-6)).find((person) => person !== latest?.author) ?? owner;
				if (latest && name !== learnerName) post(name, `answers #${latest.id}`);
			} else world(branch);
		}
	}

	notes.push(...unpickedNotes(entries));
	return { around, notes };
}

/**
 * An async take-up's moment: the one fixed participant and what they do, drawn against the live
 * transcript at claim. A reply take-up keys its branch math on the target entry — the
 * conversation this batch serves — so a batch for one branch never answers another's messages;
 * a world moment draws its focus from recent cast messages anywhere in the thread, unpicked-up
 * questions included.
 */
function drawTakeUpMoment(input: {
	ui: UiVariant;
	language: string;
	entries: TranscriptEntry[];
	scene: Scene;
	learnerName: string;
	seed: number;
	addressees?: string[] | null;
	participant: string;
	target?: TranscriptEntry;
	world?: boolean;
}): SceneMoment {
	const { entries, scene, learnerName, ui } = input;
	const draw = random(input.seed);
	const threaded = THREADED.has(ui);
	const owner = scene.counterpart.name;
	const posted = new Set(entries.filter((entry) => entry.role === "cast").map((entry) => entry.author));
	const session = entries.filter((entry) => !entry.opening);
	const anchor = input.target ?? session.findLast((entry) => entry.role === "learner");
	const newThing = threaded ? (ui === "ao3" ? "a new comment on the work" : "a new top-level comment on the post") : "carries on their own topic";

	let does: string;
	if (input.world) {
		// Someone's own business: a late answer anywhere in the thread, or something new.
		const others = entries.filter((entry) => entry.role === "cast" && entry.author !== learnerName && entry.author !== input.participant).slice(-8);
		const unpicked = others.filter(
			(entry) => !entries.some((later) => later.id > entry.id && later.role === "cast" && later.author !== entry.author),
		);
		const pool = unpicked.length ? unpicked : others;
		const focus = pool.length && draw() < 0.6 ? pool[pool.length - 1 - Math.floor(draw() * Math.min(3, pool.length))] : undefined;
		does = focus ? `answers #${focus.id}` : newThing;
	} else if (anchor) {
		// A landed cast answer in the learner's exchange can be what this participant picks up
		// instead of the learner's message itself (dependent continuation); ancestors and sibling
		// sub-threads are other conversations, never targets of this take-up.
		const branch = threaded ? exchangeOf(entries, anchor) : entries;
		const others = branch.filter((entry) => entry.author !== learnerName && entry.author !== input.participant);
		const landed = others.length && draw() < 0.35 ? others[others.length - 1 - Math.floor(draw() * Math.min(3, others.length))] : undefined;
		does = landed ? `answers #${landed.id}` : `answers #${anchor.id} (${learnerName})`;
	} else {
		does = newThing;
	}

	return { around: [presenceOf(ui, owner, posted, draw, input.participant, does)], notes: unpickedNotes(entries) };
}
