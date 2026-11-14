import { z } from "zod";
import type { ExchangePlace, ScenarioKind } from "#lib/constants.ts";
import { OPENINGS } from "#lib/exchange/opening.ts";

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
					if (!r?.success) ctx.addIssue({ code: "custom", path: ["opening"], message: r ? r.error.message : `no place ${place}` });
				});
	return z.record(z.string(), one);
}

/** A version learners may be offered: there and not a draft. */
export const live = <V extends { draft?: boolean }>(v: V | undefined): v is V => !!v && !v.draft;
