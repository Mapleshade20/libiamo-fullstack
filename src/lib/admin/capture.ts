/**
 * Real conversations captured from their pages (console scripts in `capture-scripts.ts`, or the JSON
 * Reddit serves for any post), and how a task is cut from one: the messages chosen for the opening
 * are what the learner sees; the rest of the conversation becomes the cast's background
 * (`task.source`).
 */

import { z } from "zod";
import { PRACTICE_UI_TEXT_MAX_LENGTH } from "$lib/constants";

const text = z.string();
const tags = z.array(text).optional();
const messageSchema = z.object({
	id: text,
	/** The message it answers; a thread's comment tree, or a quoted chat message. */
	parent: text.nullable().default(null),
	author: text,
	text,
	/** An ISO time (Reddit, Discord) or the page's own date text (AO3). */
	time: text.optional(),
});

const captureSchema = z.discriminatedUnion("platform", [
	z.object({
		platform: z.literal("reddit"),
		post: z.object({ title: text, body: text, subreddit: text, author: text, time: text.optional() }),
		messages: z.array(messageSchema),
	}),
	z.object({
		platform: z.literal("ao3"),
		work: z.object({
			title: text,
			/** The chapter the comments are on, for works with several. */
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
			excerpt: text.optional(),
			stats: z.record(text, text).optional(),
		}),
		messages: z.array(messageSchema),
	}),
	z.object({ platform: z.literal("discord"), serverName: text, channelName: text, messages: z.array(messageSchema) }),
]);

/** A captured conversation; its messages are in the order they were posted. */
export type Capture = z.infer<typeof captureSchema>;
export type CapturedMessage = Capture["messages"][number];

/** Chat openings keep the latest lines; the cast reads this much of the rest. */
const CHAT_OPENING_LIMIT = 40;
const BACKGROUND_LIMIT = 45;
/** Stands in for the person whose place the learner takes. */
export const LEARNER_SEAT = "(the learner's seat)";

type RedditThing = { kind: string; data: Record<string, unknown> & { replies?: { data?: { children?: RedditThing[] } } } };

const isoTime = (seconds: unknown) => (typeof seconds === "number" ? new Date(seconds * 1000).toISOString() : undefined);

/** Reddit's own JSON for a post (`<post URL>.json`): the post listing, then the comment listing. */
function fromRedditListing(value: unknown): Capture | null {
	if (!Array.isArray(value) || value[0]?.kind !== "Listing") return null;
	const post = value[0].data?.children?.[0]?.data;
	if (!post) return null;
	const comments: CapturedMessage[] = [];
	const walk = (things: RedditThing[] = []) => {
		for (const { kind, data } of things) {
			if (kind !== "t1") continue;
			const body = String(data.body ?? "");
			if (data.author !== "[deleted]" && data.author !== "AutoModerator" && body !== "[removed]" && body !== "[deleted]") {
				const parent = String(data.parent_id ?? "");
				comments.push({
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
		messages: comments.sort((a, b) => (a.time ?? "").localeCompare(b.time ?? "")),
	};
}

/** Reads what a capture script copied, or Reddit's JSON for a post. */
export function parseCapture(input: string): { success: true; capture: Capture } | { success: false; error: string } {
	let value: unknown;
	try {
		value = JSON.parse(input);
	} catch {
		return { success: false, error: "This is not JSON. Paste exactly what the capture script copied." };
	}
	const parsed = captureSchema.safeParse(fromRedditListing(value) ?? value);
	if (!parsed.success) return { success: false, error: `Not a capture: ${z.prettifyError(parsed.error)}` };
	const capture = parsed.data;
	// A thread comment whose parent was deleted stands at the top level.
	const ids = new Set(capture.messages.map((message) => message.id));
	if (capture.platform !== "discord") for (const message of capture.messages) if (message.parent && !ids.has(message.parent)) message.parent = null;
	return { success: true, capture };
}

const clip = (value: string) => value.slice(0, PRACTICE_UI_TEXT_MAX_LENGTH);

/**
 * A capture time as the platform shows it, in the task's language: Reddit's "2 yr. ago" (as of the
 * import), Discord's short date and time, AO3's own date text.
 */
function showTime(capture: Capture, time: string | undefined, language: string): string | undefined {
	const date = time ? new Date(time) : null;
	if (!time || !date || Number.isNaN(date.getTime()) || capture.platform === "ao3") return time;
	if (capture.platform === "discord") return new Intl.DateTimeFormat(language, { dateStyle: "short", timeStyle: "short" }).format(date);
	const seconds = (date.getTime() - Date.now()) / 1000;
	const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
		["year", 31_536_000],
		["month", 2_592_000],
		["day", 86_400],
		["hour", 3_600],
		["minute", 60],
	];
	const [unit, size] = units.find(([, size]) => Math.abs(seconds) >= size) ?? ["minute", 60];
	return new Intl.RelativeTimeFormat(language, { style: "short" }).format(Math.round(seconds / size), unit);
}

function tree(capture: Capture, messages: CapturedMessage[], keys: { author: string; text: string }, language: string): Record<string, unknown>[] {
	const build = (parent: string | null): Record<string, unknown>[] =>
		messages
			.filter((message) => message.parent === parent)
			.map((message) => {
				const timestamp = showTime(capture, message.time, language);
				return {
					id: message.id,
					[keys.author]: message.author,
					[keys.text]: clip(message.text),
					...(timestamp ? { timestamp } : {}),
					replies: build(message.id),
				};
			});
	return build(null);
}

/** The opening state of the platform's interface, showing `messages` of the capture (a tree closed under parents, for threads). */
export function buildOpening(capture: Capture, messages: CapturedMessage[], language = "en"): Record<string, unknown> {
	if (capture.platform === "reddit") {
		const { time, ...post } = capture.post;
		const timestamp = showTime(capture, time, language);
		return {
			post: { ...post, body: clip(post.body), ...(timestamp ? { timestamp } : {}) },
			previousComments: tree(capture, messages, { author: "author", text: "text" }, language),
		};
	}
	if (capture.platform === "ao3") {
		const { title, chapter, author, warnings, summary, excerpt, stats, ...lists } = capture.work;
		return {
			workTitle: title,
			...(chapter ? { chapterTitle: chapter } : {}),
			...(author ? { authorName: author } : {}),
			...(warnings?.length ? { archiveWarning: warnings.join(", ") } : {}),
			...Object.fromEntries(Object.entries(lists).filter(([, value]) => value?.length)),
			...(summary ? { summary: clip(summary) } : {}),
			...(excerpt ? { bodyExcerpt: clip(excerpt) } : {}),
			...(stats ? { stats } : {}),
			previousComments: tree(capture, messages, { author: "username", text: "comment" }, language),
		};
	}
	return {
		serverName: capture.serverName,
		channelName: capture.channelName,
		previousMessages: messages.map((message) => {
			const timestamp = showTime(capture, message.time, language);
			return { sender: message.author, text: clip(message.text), ...(timestamp ? { timestamp } : {}) };
		}),
	};
}

/** A plain log of `messages`, naming what each answers; `seat` is shown as the learner's seat. */
export function renderMessages(capture: Capture, messages: CapturedMessage[], seat?: string): string {
	const byId = new Map(capture.messages.map((message) => [message.id, message]));
	const name = (author: string) => (author === seat ? LEARNER_SEAT : author);
	return messages
		.map((message) => {
			const parent = message.parent ? byId.get(message.parent) : undefined;
			return `${name(message.author)}${parent ? ` ↪ ${name(parent.author)}` : ""}: ${message.text.replace(/\s*\n+\s*/g, " / ").slice(0, 1500)}`;
		})
		.join("\n");
}

/** Which messages the opening shows, and at which message the learner takes its author's place. */
export type CaptureChoice = { opening: string[]; seat?: string };

/** A chat where the learner joins at message `at`: the latest lines before it, without its author's messages or the answers to them. */
export function joinChatAt(capture: Capture, at: string): CaptureChoice {
	const index = capture.messages.findIndex((message) => message.id === at);
	const author = capture.messages[index]?.author;
	const dropped = new Set<string>();
	const before = capture.messages.slice(0, Math.max(0, index)).filter((message) => {
		if (message.author !== author && !(message.parent && dropped.has(message.parent))) return true;
		dropped.add(message.id);
		return false;
	});
	return { opening: before.slice(-CHAT_OPENING_LIMIT).map((message) => message.id), seat: at };
}

/** `ids` with every ancestor: nothing chosen for a thread hangs off a comment left out. */
export function withAncestors(capture: Capture, ids: Iterable<string>): Set<string> {
	const byId = new Map(capture.messages.map((message) => [message.id, message]));
	const chosen = new Set<string>();
	for (const id of ids) for (let at = byId.get(id); at && !chosen.has(at.id); at = at.parent ? byId.get(at.parent) : undefined) chosen.add(at.id);
	return chosen;
}

/** `ids` with every descendant: leaving a comment out leaves out its replies. */
export function withDescendants(capture: Capture, ids: Iterable<string>): Set<string> {
	const found = new Set(ids);
	for (const message of capture.messages) if (message.parent && found.has(message.parent)) found.add(message.id);
	return found;
}

/**
 * Cuts a task from a capture. The opening shows the chosen messages (for a thread, with their
 * ancestors). The background is what the learner does not see: in a chat, what followed the seat;
 * in a thread, the rest of it, replies to the opening first. The seat's author is anonymised.
 */
export function cutCapture(capture: Capture, choice: CaptureChoice, language = "en") {
	const chat = capture.platform === "discord";
	const opening = chat ? new Set(choice.opening) : withAncestors(capture, choice.opening);
	const seatIndex = choice.seat ? capture.messages.findIndex((message) => message.id === choice.seat) : -1;
	const seat = seatIndex >= 0 ? capture.messages[seatIndex].author : undefined;
	let background = chat ? capture.messages.slice(Math.max(seatIndex, 0)) : capture.messages.filter((message) => !opening.has(message.id));
	if (!chat) {
		const answersOpening = (message: CapturedMessage) => (message.parent && opening.has(message.parent) ? 0 : 1);
		const kept = new Set([...background].sort((a, b) => answersOpening(a) - answersOpening(b)).slice(0, BACKGROUND_LIMIT));
		background = background.filter((message) => kept.has(message));
	}
	return {
		ui: capture.platform,
		seat,
		openingState: buildOpening(
			capture,
			capture.messages.filter((message) => opening.has(message.id)),
			language,
		),
		openingCount: opening.size,
		continuation: renderMessages(capture, background.slice(0, BACKGROUND_LIMIT), seat),
	};
}
