import { app } from "#lib/account/app.svelte.ts";
import type { Writing } from "#lib/writing/types.ts";
import type { Collected } from "./sandbox.svelte.ts";

/*
 * What the tour writes, reads and finds already there, per language being learned: the draft it checks, the passage it
 * collects from, the fixes it types, and the stand-ins that chapters after the first start from (the piece the first
 * chapter would have finished, the phrase the second would have kept), so any chapter can be played alone. None of it
 * is the learner's. What the tutor says comes in the tutor's language, as everywhere else.
 */
type Local = Record<string, string>;
export type TourContent = {
	draft: string;
	/** What pass 1's fixes should be, by the words the tutor marks (the first one is typed; the others shown). */
	fixes: Record<string, string>;
	/** What pass 2's first rewrite says, by words of what the reader asked there or of the place itself (the model
	 *  picks the place and the question): the first that matches. */
	rewrites: [string, string][];
	/** What the learner meant, in the tutor's language, when the reader asks it openly before the rewrite. */
	meant: () => string;
	reading: string;
	/** The words the tour marks in the passage. */
	mark: string;
	/** The answer it types to the first review card. */
	review: string;
	piece: (now: number) => Writing;
	kept: (now: number) => Collected;
};

const pick = (o: Local) => o[app.tutor] ?? o.en;

export const CONTENT: Record<string, TourContent> = {
	en: {
		// Two slips pass 1 catches (make, wait the) and one sentence that is correct but reads as a complaint about the
		// pacing when it is praise ("takes forever"): what pass 2 is for.
		draft:
			"This chapter make me cry on the bus. Draco takes forever to change in this fic, so when Hermione forgave him, I believed it. I can't wait the next update!",
		fixes: { make: "made", "wait the": "wait for the", wait: "wait for" },
		rewrites: [
			["forever", "I love how slowly Draco changes, so when Hermione forgave him, I believed every bit of it."],
			["slow", "I love how slowly Draco changes, so when Hermione forgave him, I believed every bit of it."],
			["chang", "I love how slowly Draco changes, so when Hermione forgave him, I believed every bit of it."],
			["update", "I can't wait for the next update!"],
			["cry", "This chapter made me cry on the bus."],
		],
		meant: () =>
			pick({
				en: "It's praise: Draco changes slowly and believably, so when Hermione forgave him I fully believed it.",
				"zh-CN": "我是在夸：德拉科的转变很慢、很真实，所以赫敏原谅他的时候，我完全信了。",
			}),
		reading:
			"Honestly, the finale caught me off guard. I went in expecting a tidy ending, and instead it left me staring at the ceiling for an hour. The author knows how to land a punch without making a fuss about it.",
		mark: "caught me off guard",
		review: "caught me off guard",
		piece: (now) => ({
			id: "tour-piece",
			title: "Comment on “The Long Way Home”",
			site: "AO3",
			lang: "en",
			at: now,
			open: false,
			state: "revised",
			result: {
				original:
					"This chapter make me cry on the bus. Draco takes forever to change in this fic, so when Hermione forgave him, I believed it. I can't wait the next update!",
				final:
					"This chapter made me cry on the bus. I love how slowly Draco changes, so when Hermione forgave him, I believed every bit of it. I can't wait for the next update!",
				closing:
					"Crying on the bus is the best compliment. I was so worried the slow burn would bore people, so hearing you believed it means a lot.",
				reader: "plume_de_lune",
				learned: [
					{
						text: "I love how slowly Draco changes",
						own: true,
						before: "Draco takes forever to change in this fic",
						final: "I love how slowly Draco changes",
						note: {
							phrase: "I love how …",
							meaning: pick({ en: "Says straight away that what follows is praise.", "zh-CN": "一开口就表明后面说的是你喜欢的地方。" }),
							usage: pick({
								en: "“Takes forever” sounds like a complaint about the pacing; “I love how slowly …” can only be praise.",
								"zh-CN": "takes forever 听起来像在抱怨节奏太拖；说成 I love how slowly …，就只能是夸奖。",
							}),
							examples: [{ t: "I love how you never explain the ghost.", n: pick({ en: "", "zh-CN": "我很喜欢你从来不解释那个鬼是怎么回事。" }) }],
						},
					},
					{
						text: "This chapter made me cry",
						own: true,
						before: "This chapter make me cry",
						final: "This chapter made me cry",
						note: {
							phrase: "made me cry",
							meaning: pick({ en: "It already happened: the past tense, made.", "zh-CN": "事情已经发生了，用过去式 made。" }),
							usage: pick({ en: "“X made me + verb” says what something did to you.", "zh-CN": "X made me + 动词：某样东西让你怎样了。" }),
							examples: [{ t: "That last line made me laugh out loud.", n: pick({ en: "", "zh-CN": "最后那句让我笑出了声。" }) }],
						},
					},
				],
				leftovers: [],
				finishedAt: now,
			},
		}),
		kept: (now) => ({
			phrase: "caught me off guard",
			meaning: pick({ en: "Surprised you when you weren't ready for it.", "zh-CN": "在你毫无防备时让你吃了一惊。" }),
			register: "casual",
			why: pick({ en: "Fits reactions to a story or news: friendly, not dramatic.", "zh-CN": "适合说对故事或消息的反应：亲切、不夸张。" }),
			example: "The ending caught me off guard, in the best way.",
			lang: "en",
			at: now,
			sentence: "Honestly, the finale caught me off guard.",
			marked: "caught me off guard",
			batch: "tour",
		}),
	},
};

/** The tour's content for the language being learned; English stands in until a language has its own. */
export const contentFor = (lang: string) => CONTENT[lang] ?? CONTENT.en;
export const hasContent = (lang: string) => lang in CONTENT;
