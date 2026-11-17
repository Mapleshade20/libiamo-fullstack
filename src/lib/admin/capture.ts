import { z } from "zod";
import type { ExchangePlace } from "#lib/constants.ts";
import { type Ao3Comment, OPENINGS, type Opening, type RedditComment } from "#lib/exchange/opening.ts";
import type { ExchangeVersion } from "#lib/scenario/versions.ts";

/*
 * A real conversation captured from its page (the console scripts in server/writing/capture-scripts.ts, or the JSON
 * Reddit serves for any post), and how a scenario is cut from one: the messages chosen for the opening are what the
 * learner sees; what came after them is `followed`, which the people draw on and learners never see. Everyone who
 * writes in the opening becomes one of the version's people (design §5.3). Pure: the admin's editor runs it.
 */
const text = z.string();
const tags = z.array(text).optional();
const Message = z.object({
	id: z.coerce.string(),
	/** The message it answers: a thread's comment tree, or a quoted chat message. */
	parent: z.coerce.string().nullable().default(null),
	author: text,
	text,
	/** An ISO time (Reddit, Discord) or the page's own date text (AO3). */
	time: text.optional(),
});
const CaptureSchema = z.discriminatedUnion("platform", [
	z.object({
		platform: z.literal("reddit"),
		post: z.object({ title: text, body: text, subreddit: text, author: text, time: text.optional() }),
		messages: z.array(Message),
	}),
	z.object({
		platform: z.literal("ao3"),
		work: z.object({
			title: text,
			chapter: text.optional(),
			author: text.optional(),
			rating: text.optional(),
			warnings: tags,
			categories: tags,
			fandoms: tags,
			relationships: tags,
			characters: tags,
			additionalTags: tags,
			summary: text.optional(),
			/** The preface's and the end's notes, joined by a line of dashes. */
			notes: text.optional(),
			/** The whole work (the script's), or an excerpt. */
			body: text.optional(),
			excerpt: text.optional(),
			stats: z.record(text, text).optional(),
		}),
		messages: z.array(Message),
	}),
	z.object({ platform: z.literal("discord"), serverName: text, channelName: text, messages: z.array(Message) }),
]);
export type Capture = z.infer<typeof CaptureSchema>;
export type CapturedMessage = Capture["messages"][number];

/** What an opening may hold (lib/exchange/opening.ts), what `followed` keeps, and how many people a version has. */
export const OPENING_LIMIT = 60;
export const FOLLOWED_LIMIT = 40;
export const PEOPLE_LIMIT = 12;
const LINE = 500;
const BODY = 20_000;
const FOLLOWED_TEXT = 20_000;
const EXCERPT = 1500;
/** Who stands for the person whose place the learner takes, in what followed. */
export const LEARNER_SEAT = "(the learner)";

type RedditThing = { kind: string; data: Record<string, unknown> & { replies?: { data?: { children?: RedditThing[] } } } };
const isoTime = (seconds: unknown) => (typeof seconds === "number" ? new Date(seconds * 1000).toISOString() : undefined);

/** Reddit's own JSON for a post (`<post URL>.json`): the post listing, then the comment listing. */
function fromRedditListing(value: unknown): unknown {
	if (!Array.isArray(value) || value[0]?.kind !== "Listing") return null;
	const post = value[0].data?.children?.[0]?.data;
	if (!post) return null;
	const messages: CapturedMessage[] = [];
	const walk = (things: RedditThing[] = []) => {
		for (const { kind, data } of things) {
			if (kind !== "t1") continue;
			const body = String(data.body ?? "");
			if (data.author !== "[deleted]" && data.author !== "AutoModerator" && body !== "[removed]" && body !== "[deleted]") {
				const parent = String(data.parent_id ?? "");
				messages.push({
					id: String(data.name),
					parent: parent.startsWith("t1_") ? parent : null,
					author: String(data.author),
					text: body,
					time: isoTime(data.created_utc),
				});
			}
			walk(data.replies?.data?.children);
		}
	};
	walk(value[1]?.data?.children);
	return {
		platform: "reddit",
		post: {
			title: String(post.title ?? ""),
			body: String(post.selftext ?? ""),
			subreddit: String(post.subreddit ?? ""),
			author: String(post.author ?? ""),
			time: isoTime(post.created_utc),
		},
		messages: messages.sort((a, b) => (a.time ?? "").localeCompare(b.time ?? "")),
	};
}

/** What a capture script copied, or Reddit's JSON for a post; null for anything else. */
export function parseCapture(input: string): Capture | null {
	const raw = input.trim();
	// Up to three stray characters around the JSON are forgiven, as the composer forgives them.
	const from = raw.search(/\{\s*"|\[\s*\{/);
	if (from < 0 || from > 3) return null;
	let value: unknown;
	try {
		value = JSON.parse(raw.slice(from, raw.lastIndexOf(raw[from] === "[" ? "]" : "}") + 1));
	} catch {
		return null;
	}
	const parsed = CaptureSchema.safeParse(fromRedditListing(value) ?? value);
	if (!parsed.success) return null;
	const capture = parsed.data;
	capture.messages = capture.messages.filter((m) => m.text.trim() && m.author.trim());
	// A reply whose parent was not captured (or was deleted) stands at the top level.
	const ids = new Set(capture.messages.map((m) => m.id));
	for (const m of capture.messages) if (m.parent && !ids.has(m.parent)) m.parent = null;
	return capture;
}

const clip = (value: string, max: number) => (value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value);

/** The end of a chapter, cut at a paragraph: what the reader has just read when they comment. */
function chapterEnd(body: string): string {
	const chapters = body.split(/\n\n\* \* \*\n\n/);
	const last = (chapters.at(-1) ?? "").trim();
	if (last.length <= EXCERPT) return last;
	const paragraphs = last.split(/\n\s*\n/);
	const kept: string[] = [];
	let length = 0;
	for (let i = paragraphs.length - 1; i >= 0 && length + paragraphs[i].length <= EXCERPT; i--) {
		kept.unshift(paragraphs[i]);
		length += paragraphs[i].length + 2;
	}
	return kept.length ? kept.join("\n\n") : `…${last.slice(-EXCERPT).trimStart()}`;
}

/**
 * A capture time as the platform shows it, in the version's language: Reddit's "2 yr. ago" (as of the import),
 * Discord's short date and time, AO3's own date text.
 */
function showTime(capture: Capture, time: string | undefined, language: string, now: number): string | undefined {
	const date = time ? new Date(time) : null;
	if (!time || !date || Number.isNaN(date.getTime()) || capture.platform === "ao3") return time ? clip(time, LINE) : undefined;
	if (capture.platform === "discord") return new Intl.DateTimeFormat(language, { dateStyle: "short", timeStyle: "short" }).format(date);
	const seconds = (date.getTime() - now) / 1000;
	const units: [Intl.RelativeTimeFormatUnit, number][] = [
		["year", 31_536_000],
		["month", 2_592_000],
		["day", 86_400],
		["hour", 3_600],
		["minute", 60],
	];
	const [unit, size] = units.find(([, s]) => Math.abs(seconds) >= s) ?? ["minute", 60];
	return new Intl.RelativeTimeFormat(language, { style: "short" }).format(Math.round(seconds / size), unit);
}

/** Which messages the opening shows, and, in a chat, the message where the learner takes its author's place. */
export type CaptureChoice = { opening: string[]; seat?: string };

/**
 * A chat the learner comes into at message `at` (or after the last, without one): the latest lines before it, without
 * the seat's own author or the answers to them.
 */
export function joinChatAt(capture: Capture, at?: string): CaptureChoice {
	const index = at ? capture.messages.findIndex((m) => m.id === at) : -1;
	const author = index >= 0 ? capture.messages[index].author : undefined;
	const dropped = new Set<string>();
	const before = (index >= 0 ? capture.messages.slice(0, index) : capture.messages).filter((m) => {
		if (m.author !== author && !(m.parent && dropped.has(m.parent))) return true;
		dropped.add(m.id);
		return false;
	});
	return { opening: before.slice(-OPENING_LIMIT).map((m) => m.id), ...(index >= 0 ? { seat: at } : {}) };
}

/** `ids` with every ancestor: nothing chosen for a thread hangs off a comment left out. */
export function withAncestors(capture: Capture, ids: Iterable<string>): Set<string> {
	const byId = new Map(capture.messages.map((m) => [m.id, m]));
	const chosen = new Set<string>();
	for (const id of ids) for (let at = byId.get(id); at && !chosen.has(at.id); at = at.parent ? byId.get(at.parent) : undefined) chosen.add(at.id);
	return chosen;
}

/** `ids` with every descendant: leaving a comment out leaves out its replies. */
export function withDescendants(capture: Capture, ids: Iterable<string>): Set<string> {
	const found = new Set(ids);
	// Messages are in the order they were posted, so a reply comes after what it answers.
	for (const m of capture.messages) if (m.parent && found.has(m.parent)) found.add(m.id);
	return found;
}

/** What importing a capture gives the version: its opening, what followed, and who writes in the opening. */
export type CaptureCut = {
	opening: Opening<"reddit"> | Opening<"ao3"> | Opening<"discord">;
	followed: { author: string; text: string }[];
	/** Everyone who writes in the opening, the one the learner answers first. */
	people: string[];
};

/** Cuts a scenario's version from a capture. */
export function cutCapture(capture: Capture, choice: CaptureChoice, language = "en", now = Date.now()): CaptureCut {
	const chat = capture.platform === "discord";
	const opening = chat ? new Set(choice.opening) : withAncestors(capture, choice.opening);
	const shown = capture.messages.filter((m) => opening.has(m.id));
	const kept = new Set(shown.map((m) => m.id));
	const seatIndex = choice.seat ? capture.messages.findIndex((m) => m.id === choice.seat) : -1;
	const seat = seatIndex >= 0 ? capture.messages[seatIndex].author : undefined;
	// In a chat, what came from the seat on; in a thread, the rest of it, the answers to the opening first.
	let after = chat ? (seatIndex >= 0 ? capture.messages.slice(seatIndex) : []) : capture.messages.filter((m) => !kept.has(m.id));
	if (!chat) {
		const answers = (m: CapturedMessage) => (m.parent && kept.has(m.parent) ? 0 : 1);
		const first = new Set([...after].sort((a, b) => answers(a) - answers(b)).slice(0, FOLLOWED_LIMIT));
		after = after.filter((m) => first.has(m));
	}
	const followed = after.slice(0, FOLLOWED_LIMIT).map((m) => ({
		author: clip(m.author === seat ? LEARNER_SEAT : m.author, 300),
		text: clip(m.text, FOLLOWED_TEXT),
	}));
	const time = (m: CapturedMessage) => {
		const t = showTime(capture, m.time, language, now);
		return t ? { timestamp: t } : {};
	};
	const tree = <C>(make: (m: CapturedMessage, replies: C[]) => C) => {
		const build = (parent: string | null): C[] => shown.filter((m) => m.parent === parent).map((m) => make(m, build(m.id)));
		return build(null);
	};
	const names = (first: string | undefined) => [
		...new Set([first, ...shown.map((m) => m.author)].map((n) => n?.trim()).filter((n): n is string => !!n)),
	];

	if (capture.platform === "reddit") {
		const { time: postTime, ...post } = capture.post;
		const posted = showTime(capture, postTime, language, now);
		return {
			opening: {
				post: {
					title: clip(post.title, LINE),
					body: clip(post.body, BODY),
					subreddit: clip(post.subreddit, LINE),
					author: clip(post.author, LINE),
					...(posted ? { timestamp: posted } : {}),
				},
				previousComments: tree<RedditComment>((m, replies) => ({
					author: clip(m.author, LINE),
					text: clip(m.text, BODY),
					...time(m),
					...(replies.length ? { replies } : {}),
				})),
			},
			followed,
			people: names(post.author),
		};
	}
	if (capture.platform === "ao3") {
		const w = capture.work;
		const list = (v: string[] | undefined) => (v?.length ? v.slice(0, 40).map((x) => clip(x, LINE)) : undefined);
		const notes = w.notes?.split(/\n---\n/) ?? [];
		const opening: Opening<"ao3"> = {
			workTitle: clip(w.title, LINE),
			...(w.author ? { authorName: clip(w.author, LINE) } : {}),
			...(w.chapter ? { chapterTitle: clip(w.chapter, LINE) } : {}),
			...(w.rating ? { rating: clip(w.rating, LINE) } : {}),
			...(w.warnings?.length ? { archiveWarning: clip(w.warnings.join(", "), LINE) } : {}),
			categories: list(w.categories),
			fandoms: list(w.fandoms),
			relationships: list(w.relationships),
			characters: list(w.characters),
			additionalTags: list(w.additionalTags),
			...(w.summary ? { summary: clip(w.summary, BODY) } : {}),
			bodyExcerpt: w.body ? chapterEnd(w.body) : clip(w.excerpt ?? "", BODY),
			// The end's notes are the last; the author asks for comments there.
			...(notes.length ? { endNote: clip(notes.at(-1) ?? "", BODY) } : {}),
			...(w.stats ? { stats: Object.fromEntries(Object.entries(w.stats).map(([k, v]) => [k, clip(v, LINE)])) } : {}),
			previousComments: tree<Ao3Comment>((m, replies) => ({
				username: clip(m.author, LINE),
				comment: clip(m.text, BODY),
				...time(m),
				...(replies.length ? { replies } : {}),
			})),
		};
		for (const k of ["categories", "fandoms", "relationships", "characters", "additionalTags"] as const) if (!opening[k]) delete opening[k];
		return { opening, followed, people: names(w.author) };
	}
	return {
		opening: {
			serverName: clip(capture.serverName, LINE),
			channelName: clip(capture.channelName, LINE),
			previousMessages: shown.map((m) => ({ sender: clip(m.author, LINE), text: clip(m.text, BODY), ...time(m) })),
		},
		followed,
		// In a chat the learner answers whoever spoke last before they come in.
		people: names(shown.at(-1)?.author),
	};
}

type Person = ExchangeVersion["people"][number];

/**
 * The version's people once a cut is imported: everyone who writes in the opening, those already there keeping what was
 * written about them, the one the learner answers first; others with something written about them stay after them.
 */
export function mergePeople(had: Person[], writing: string[]): Person[] {
	const known = new Map(had.map((p) => [p.name.trim(), p]));
	const names = new Set(writing);
	return [
		...writing.map((name) => known.get(name) ?? { name, who: "", notes: "" }),
		...had.filter((p) => !names.has(p.name.trim()) && (p.who.trim() || p.notes.trim())),
	];
}

/** Why a cut cannot be imported into a version with these people (it would not save), or null. */
export function cutProblem(cut: CaptureCut, place: ExchangePlace, had: Person[]): string | null {
	if (cut.people.length > PEOPLE_LIMIT) return `a scenario has at most ${PEOPLE_LIMIT} people, so leave some out`;
	const people = mergePeople(had, cut.people).length;
	if (people > PEOPLE_LIMIT)
		return `with those already described here that makes ${people} people, and a scenario has at most ${PEOPLE_LIMIT}: leave some out, or remove someone from People first`;
	const checked = OPENINGS[place].safeParse(cut.opening);
	if (checked.success) return null;
	const issue = checked.error.issues[0];
	const listed = issue.path[0] === "previousComments" || issue.path[0] === "previousMessages";
	if (issue.code === "too_big" && listed && issue.path.length === 1)
		return `an opening holds at most ${OPENING_LIMIT} ${place === "discord" ? "lines" : "comments under the post (their replies aside)"}, so leave some out`;
	return `the opening would not save (${issue.path.join(".")}: ${issue.message})`;
}
