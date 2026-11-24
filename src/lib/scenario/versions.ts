import { z } from "zod";
import type { ExchangePlace, ScenarioKind } from "#lib/constants.ts";
import { OPENINGS, openingNames } from "#lib/exchange/opening.ts";

/*
 * A scenario's versions (design §5.3), keyed by the language learnt and validated on every write. A version may be a
 * draft while the others are live. An exchange's people are who the learner meets (the first is whom they answer);
 * their notes, "others" and what followed in the real thread are for the models and the admin, never a page.
 */
const short = z.string().trim().max(300);
const long = z.string().max(20_000);

const Person = z.object({ name: z.string().trim().min(1).max(80), who: short, notes: z.string().max(4000).default("") });
export const ExchangeVersion = z.object({
	draft: z.boolean().optional(),
	title: short.min(1),
	line: short,
	introduction: z.string().max(4000).optional(),
	you: short,
	people: z.array(Person).min(1).max(12),
	goals: z.array(short.min(1)).max(6),
	/** Who else may turn up (their names are drawn by code). */
	others: z.string().max(2000).default(""),
	opening: z.unknown(),
	/** How the real thread went on, when the scenario is cut from one: the agents read it, a learner never does. */
	followed: z
		.array(z.object({ author: short.min(1), text: long }))
		.max(40)
		.default([]),
});
export type ExchangeVersion = z.infer<typeof ExchangeVersion>;

export const TranslationVersion = z.object({
	draft: z.boolean().optional(),
	title: short.min(1),
	line: short,
	/** Who wants it and why. */
	introduction: z.string().max(4000),
	/** The text as first written, in the language learnt: what the passes compare the translation with. */
	original: long.min(1),
	where: short,
	readers: short,
	/** Names and terms the source must give. */
	terms: z.array(short.min(1)).max(60).default([]),
	/** Names and terms the source must not give, whatever the model picks: what the learner is there to learn. */
	leaveOut: z.array(short.min(1)).max(60).default([]),
});
export type TranslationVersion = z.infer<typeof TranslationVersion>;

export type Version = ExchangeVersion | TranslationVersion;

/** The versions of a scenario of this kind and place, validated whole; the opening by its place. */
export function versionsSchema(kind: ScenarioKind, place: string) {
	const one =
		kind === "translation"
			? TranslationVersion
			: ExchangeVersion.superRefine((v, ctx) => {
					const r = OPENINGS[place as ExchangePlace]?.safeParse(v.opening);
					if (!r) ctx.addIssue({ code: "custom", path: ["opening"], message: `there is no place ${place}` });
					else for (const i of r.error?.issues ?? []) ctx.addIssue({ ...i, path: ["opening", ...i.path] } as never);
					if (!r?.success) return;
					const people = new Set(v.people.map((p) => p.name));
					for (const name of openingNames(place as ExchangePlace, v.opening))
						if (!people.has(name))
							ctx.addIssue({ code: "custom", path: ["opening"], message: `${name} writes in the opening but is not one of the people` });
				});
	return z.record(z.string(), one);
}

/* What the admin is told of a version that cannot be saved: the language, the field as the page names it, what is wrong. */
const FIELD: Record<string, string> = {
	title: "Title",
	line: "Line on the card",
	introduction: "Introduction",
	you: "Who the learner is",
	others: "Others who may turn up",
	original: "Text",
	where: "Where it appears",
	readers: "Who reads it",
	opening: "Opening",
	workTitle: "Work",
	subreddit: "Subreddit",
	author: "Author",
	name: "name",
	who: "who they are",
	from: "From",
	subject: "Subject",
	sender: "sender",
	text: "text",
	body: "text",
	username: "name",
	comment: "text",
	serverName: "Server",
	channelName: "Channel",
};
const ONE: Record<string, string> = {
	people: "Person",
	goals: "Goal",
	terms: "Term it must give",
	leaveOut: "Term it must not give",
	followed: "What followed",
	emails: "Email",
	previousMessages: "Message",
	previousComments: "Comment",
	replies: "reply",
};
function fieldOf(path: PropertyKey[]) {
	const out: string[] = [];
	path.forEach((k, i) => {
		const next = path[i + 1];
		if (typeof k === "number" || k === "post") return;
		if (typeof next === "number") out.push(`${ONE[String(k)] ?? String(k)} ${next + 1}`);
		else out.push(path[i - 1] === "post" && k === "author" ? "Posted by" : (FIELD[String(k)] ?? String(k)));
	});
	return out.join(", ");
}
function wrongOf(i: z.core.$ZodIssue) {
	if (i.code === "too_small") return i.origin === "array" ? `needs at least ${i.minimum}` : "is empty";
	if (i.code === "too_big") return i.origin === "array" ? "has too many" : "is too long";
	if (i.code === "invalid_type") return "is missing";
	return i.message;
}
/** Why versions cannot be saved, one line each ("Spanish: Opening, Subreddit is empty"). */
export function versionProblems(issues: z.core.$ZodIssue[], langOf: (code: string) => string): string[] {
	const lines = issues.map((i) => {
		const [l, ...path] = i.path;
		const field = fieldOf(path);
		return `${langOf(String(l))}: ${i.code === "custom" ? i.message : `${field || "It"} ${wrongOf(i)}`}`;
	});
	return [...new Set(lines)];
}

/** A version learners may be offered: there and not a draft. */
export const live = <V extends { draft?: boolean }>(v: V | undefined): v is V => !!v && !v.draft;
