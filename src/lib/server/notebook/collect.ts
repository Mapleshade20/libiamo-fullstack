// The stealing notebook (偷词本): the learner pastes something they read and highlights what they want to own. One call
// fills in every highlight at once (what it means here, how it sounds, what makes it worth taking, one example of their
// own to imitate); a second answers their questions about one of them. Nothing here writes for the learner.
import { z } from "zod";
import { REGISTERS } from "#lib/constants.ts";
import { unmark } from "#lib/review/faces.ts";
import { type Caller, chat, chatJson } from "#lib/server/llm/caller.ts";
import { LANG_NAMES } from "#lib/server/revision/draft.ts";

const NAME = LANG_NAMES as Record<string, string>;
export type Highlight = { n: number; text: string };
export type CollectInput = { passage: string; lang: string; native: string; feedback: "native" | "target"; ai: Caller };

// Lenient where a model's slip should not cost the learner their highlight: a number as a string, a register named
// differently (it falls back to neutral).
const Item = z.object({
	n: z.coerce.number(),
	phrase: z.string(),
	meaning: z.string(),
	register: z
		.string()
		.transform((r) => ((REGISTERS as readonly string[]).includes(r.toLowerCase()) ? (r.toLowerCase() as (typeof REGISTERS)[number]) : "neutral")),
	why: z.string(),
	example: z.string(),
	/** The words of the example that are the phrase as used there, so a review card can blank them ("framed … as"). */
	span: z.string().optional(),
});
/** `at`: where `span` begins in the example. */
export type Explained = z.infer<typeof Item> & { at?: number[] };

/** The tutor's language: the learner's own, or the one they read in, as they chose. */
const tutorOf = (d: CollectInput) => NAME[d.feedback === "native" ? d.native : d.lang] ?? "English";

/**
 * Highlights are numbered 1..k in the prompt whatever the page calls them, and answers are matched back by that number
 * (or, failing it, by order): a model asked about one highlight numbered 3 tends to answer for "1". `retry` asks for a
 * fresh sample, since replies are cached and a retry would otherwise read the same reply again.
 */
export async function explain(d: CollectInput, given: Highlight[], retry = 0): Promise<Explained[]> {
	const highlights = given.map((h, i) => ({ n: i + 1, text: h.text }));
	const T = NAME[d.lang] ?? d.lang;
	const F = tutorOf(d);
	const user = [
		`A learner of ${T} (their own language: ${NAME[d.native] ?? d.native}) is reading this and has highlighted parts they want to learn to use in their own writing.`,
		"",
		"<<<",
		d.passage,
		">>>",
		"",
		"Highlights:",
		...highlights.map((h) => `${h.n}. "${h.text}"`),
		"",
		`For each highlight, in order:`,
		`- phrase: what to keep, in ${T}, as a learner would note it down: the highlighted words trimmed or extended to the whole natural unit (a full collocation, idiom or pattern; the verb with its usual object or preposition). Put "someone" or "something" (in ${T}) where a part changes from use to use. Keep it short.`,
		`- meaning: in ${F}, what it means here, in a few words (not a dictionary list).`,
		"- register: neutral, casual, formal, slang, literary or technical.",
		`- why: in ${F}, one sentence on what makes it worth taking: the specific choice a learner of ${T} would not make on their own (contrast with the plainer way they would say it). Concrete; never just "more natural".`,
		`- example: one short new sentence in ${T} using the phrase in an everyday situation unlike the passage's, with the phrase as used there marked by a tag (<m>…</m>): the words that are the phrase, as they are inflected there, and not words that only fill a slot in it; when other words come between its parts, each part is marked on its own.`,
		`Reply with JSON only: {"items":[{"n":1,"phrase":"","meaning":"","register":"neutral","why":"","example":""}]}`,
	].join("\n");
	const { value } = await chatJson([{ role: "user", content: user }], z.object({ items: z.array(Item) }), {
		ai: d.ai,
		effort: "low",
		tag: "collect/explain",
		sample: retry,
	});
	// The example as the learner reads it, and where the phrase is in it (a recorded reply may still give span apart).
	return matchExplained(
		given,
		value.items.map((it) => {
			const m = unmark(it.example);
			return { ...it, example: m.text, span: m.span ?? it.span, at: m.at };
		}),
	);
}

/** The answers, under the page's own numbers: by the 1..k numbering the prompt used, else by order when counts agree. */
export function matchExplained(given: Highlight[], items: Explained[]): Explained[] {
	return given
		.map((h, i) => {
			const item = items.find((it) => it.n === i + 1) ?? (items.length === given.length ? items[i] : undefined);
			return item ? { ...item, n: h.n } : null;
		})
		.filter((x): x is Explained => !!x);
}

export type Turn = { q: string; a: string };
/** The learner's question about one phrase they kept, with what they asked before about it. */
export async function ask(d: CollectInput, phrase: string, history: Turn[], question: string): Promise<string> {
	const T = NAME[d.lang] ?? d.lang;
	const F = tutorOf(d);
	const system = `You are a ${T} tutor. A learner (their own language: ${NAME[d.native] ?? d.native}) kept the phrase "${phrase}" from something they read, and asks about it. Answer in ${F}, briefly (at most about 80 words), concretely and plainly, like a friend who knows ${T} well. Any ${T} examples stay in ${T}. If they ask for real examples, give two or three short, varied, natural ones. If you are not sure something is said, say so.\n\nWhat they read:\n<<<\n${d.passage.slice(0, 3000)}\n>>>`;
	const msgs = [
		{ role: "system" as const, content: system },
		...history.flatMap((t) => [
			{ role: "user" as const, content: t.q },
			{ role: "assistant" as const, content: t.a },
		]),
		{ role: "user" as const, content: question },
	];
	return (await chat(msgs, { ai: d.ai, effort: "low", tag: "collect/ask" })).text.trim();
}
