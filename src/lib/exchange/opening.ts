import { z } from "zod";
import type { ExchangePlace } from "#lib/constants.ts";
import type { Situation } from "#lib/scenario/types.ts";
import { flattenOpeningComments } from "./comment-thread.ts";
import { parseMailAddress } from "./mail.ts";

/*
 * What a place shows when the learner arrives (design §5.3): the old per-place opening state, without the counterpart's
 * name and the members, which a version's `people` replaces. An AO3 chapter also keeps its end note, which the
 * place draws under the chapter. The scenario page draws a quieter projection of it (`situationOf`).
 */
const line = z.string().max(500);
const body = z.string().max(20_000);

export type RedditComment = { author: string; text: string; timestamp?: string; replies?: RedditComment[] };
const RedditComment: z.ZodType<RedditComment> = z.object({
	author: line,
	text: body,
	timestamp: line.optional(),
	replies: z.lazy(() => z.array(RedditComment)).optional(),
});
export type Ao3Comment = { username: string; comment: string; timestamp?: string; chapterTitle?: string; replies?: Ao3Comment[] };
const Ao3Comment: z.ZodType<Ao3Comment> = z.object({
	username: line,
	comment: body,
	timestamp: line.optional(),
	chapterTitle: line.optional(),
	replies: z.lazy(() => z.array(Ao3Comment)).optional(),
});
const tags = z.array(line).max(40).optional();

export const OPENINGS = {
	ao3: z.object({
		workTitle: line.min(1),
		authorName: line.optional(),
		chapterTitle: line.optional(),
		summary: body.optional(),
		bodyExcerpt: body.optional(),
		/** The author's note at the chapter's end. */
		endNote: body.optional(),
		rating: line.optional(),
		archiveWarning: line.optional(),
		categories: tags,
		fandoms: tags,
		relationships: tags,
		characters: tags,
		additionalTags: tags,
		stats: z.record(z.string(), line).optional(),
		previousComments: z.array(Ao3Comment).max(60).optional(),
	}),
	reddit: z.object({
		post: z.object({ title: line.min(1), body, subreddit: line.min(1), author: line.min(1), timestamp: line.optional() }),
		previousComments: z.array(RedditComment).max(60).optional(),
	}),
	email: z.object({
		emails: z
			.array(z.object({ from: line.min(1), to: line.default(""), subject: line, body, time: line.optional() }))
			.min(1)
			.max(20),
	}),
	discord: z.object({
		/** A direct message with the first person instead of a server channel. */
		dm: z.boolean().optional(),
		serverName: line,
		channelName: line,
		previousMessages: z
			.array(z.object({ sender: line.min(1), text: body, timestamp: line.optional() }))
			.max(60)
			.default([]),
	}),
	imessage: z.object({
		/** A group chat's name; none is a conversation with the first person. */
		groupName: line.optional(),
		previousMessages: z
			.array(z.object({ sender: line.min(1), text: body }))
			.max(60)
			.default([]),
	}),
} satisfies Record<ExchangePlace, z.ZodType>;
export type Opening<P extends ExchangePlace = ExchangePlace> = z.infer<(typeof OPENINGS)[P]>;

function flatReddit(list: RedditComment[] = [], depth = 0): Extract<Situation, { kind: "reddit" }>["comments"] {
	return list.flatMap((c) => [
		{ author: c.author, body: c.text, ...(depth ? { depth } : {}), ...(c.timestamp ? { time: c.timestamp } : {}) },
		...flatReddit(c.replies, depth + 1),
	]);
}

/** The scenario page's drawing of an opening. `first` is the version's first person (a chat with no group name is theirs). */
export function situationOf(place: ExchangePlace, opening: unknown, first = ""): Situation | undefined {
	const r = OPENINGS[place].safeParse(opening);
	if (!r.success) return undefined;
	switch (place) {
		case "ao3": {
			const o = r.data as Opening<"ao3">;
			return {
				kind: "ao3",
				work: o.workTitle,
				author: o.authorName ?? "",
				chapter: o.chapterTitle ?? "",
				excerpt: o.bodyExcerpt ?? "",
				note: o.endNote ?? "",
			};
		}
		case "reddit": {
			const o = r.data as Opening<"reddit">;
			return {
				kind: "reddit",
				sub: o.post.subreddit,
				title: o.post.title,
				author: o.post.author,
				body: o.post.body,
				...(o.post.timestamp ? { time: o.post.timestamp } : {}),
				comments: flatReddit(o.previousComments),
			};
		}
		case "email": {
			// The mail the learner answers: the thread's last.
			const m = (r.data as Opening<"email">).emails.at(-1);
			if (!m) return undefined;
			return { kind: "email", from: m.from, ...(m.to ? { to: m.to } : {}), subject: m.subject, body: m.body, ...(m.time ? { time: m.time } : {}) };
		}
		case "discord": {
			const o = r.data as Opening<"discord">;
			return {
				kind: "chat",
				place: o.dm ? first : `#${o.channelName}`,
				messages: o.previousMessages.map((m) => ({ author: m.sender, text: m.text, ...(m.timestamp ? { time: m.timestamp } : {}) })),
			};
		}
		case "imessage": {
			const o = r.data as Opening<"imessage">;
			return { kind: "chat", place: o.groupName || first, messages: o.previousMessages.map((m) => ({ author: m.sender, text: m.text })) };
		}
	}
}

/**
 * Everyone the opening names as writing something (senders, mail authors, commenters, the post's or work's author). Each
 * must be one of the version's people: a name the people do not have becomes a second persona the cast also voices.
 */
export function openingNames(place: ExchangePlace, opening: unknown): string[] {
	const o = (opening ?? {}) as Record<string, unknown>;
	const list = (v: unknown) => (Array.isArray(v) ? (v as Record<string, unknown>[]) : []);
	const names: string[] = [];
	if (place === "imessage" || place === "discord") for (const m of list(o.previousMessages)) names.push(String(m.sender ?? ""));
	if (place === "email") for (const e of list(o.emails)) names.push(parseMailAddress(String(e.from ?? "")).name);
	if (place === "reddit" || place === "ao3") {
		names.push(String(place === "reddit" ? ((o.post as Record<string, unknown> | undefined)?.author ?? "") : (o.authorName ?? "")));
		names.push(...flattenOpeningComments(place, o).map((c) => c.author));
	}
	return [...new Set(names.map((n) => n.trim()).filter(Boolean))];
}
