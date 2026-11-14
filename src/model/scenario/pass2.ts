// Pass 2 over a finished scenario's exchange (Q2). The analysis is v6's (analyze.ts), over the learner's turns after pass 1,
// numbered across turns and set in the exchange. `evidence` adds what a free draft never has: the others already
// answered, so each turn is first judged by how it landed, and a turn that landed off because of its wording must get
// a spot there.
import { z } from "zod";
import { type Draft, fbName, LANG_NAMES, levelLine, noteLines } from "../fixtures/types.ts";
import { chat, chatJson, extractJson, type ModelKey } from "../llm.ts";
import { AnalysisSchema, leftLine, SCAN_RULE, type Sentence, SHAPE_V6, sentences, TASK_V6 } from "../pass2/analyze.ts";
import { type Case, draftOf, exchange, SEP } from "./exchange.ts";

export const Landed = z.object({
	t: z.number(),
	outcome: z.enum(["as meant", "off"]),
	cause: z.enum(["wording", "content", "reader", "none"]),
	why: z.string(),
});
export const ExchangeAnalysis = AnalysisSchema.extend({ turns: z.array(Landed).optional() });
export type ExchangeAnalysis = z.infer<typeof ExchangeAnalysis>;

/**
 * The text's sentences by turn, numbered as `sentences` numbers the whole text (the separator lines take a number and
 * are skipped), so the live session's spot ranges and map rows read the same numbers.
 */
export function turnSentences(text: string, lang: string): { turn: number; ss: Sentence[] }[] {
	const out: { turn: number; ss: Sentence[] }[] = [{ turn: 1, ss: [] }];
	for (const s of sentences(text, lang)) {
		if (s.text === SEP) out.push({ turn: out.length + 1, ss: [] });
		else out[out.length - 1].ss.push(s);
	}
	return out;
}

const REGISTER = (T: string) =>
	`- register that does not fit the moment and these people: too formal or stiff for a quick message between friends or classmates, too blunt or demanding for a request to someone who owes the writer nothing, a question that sounds like an accusation. This is a formulation spot: say how a ${T} reader takes the tone.`;

/** stage "draft": the turns as written (the live session analyses them while pass 1 is still being labelled). */
export async function analyzeExchange(
	c: Case,
	text: string,
	native: string,
	model: ModelKey,
	evidence: boolean,
	base: Draft = draftOf(c),
	stage: "draft" | "pass1" = "pass1",
	left: string[] = [],
) {
	const d = { ...base, text };
	const pass1 = text;
	const T = LANG_NAMES[d.target];
	const byTurn = turnSentences(pass1, d.target);
	const numberedTurn = (n: number) => byTurn[n - 1]?.ss.map((s) => `[S${s.id}] ${s.text}`).join("\n") ?? "";
	const task = TASK_V6(d).replace(/(kind "formulation":[^\n]*\n)/, `$1${REGISTER(T)}\n`);
	const intro = [
		`Target language: ${T}. The writer's own language: ${LANG_NAMES[d.learner]}.${levelLine(d)}`,
		`Where: ${d.scene.platform}. Who reads: ${d.scene.audience}. What the writer wanted: ${d.scene.purpose}.`,
		...noteLines(d),
		"",
		`A conversation that has already happened. The writer's turns [T1], [T2]… are shown ${stage === "draft" ? "as they wrote them (a separate pass fixes their small language errors: grammar, articles, tense, wrong words; ignore those)" : "after a first pass fixed their small language errors"}, with their sentences numbered; spots are only ever in the numbered sentences. Everyone else's messages are context.`,
		"<<<",
		exchange(c, { mine: (n) => numberedTurn(n) }),
		">>>",
		...(left.length ? [leftLine(left)] : []),
		// The author asked "scared of the journey, or of what she'd find?" and the writer's "I think more about what she
		// find" was read as the writer musing ("I keep worrying about…"), while the author's "That's exactly it" showed
		// it meant "more scared of what she'd find".
		"Each turn answers what came just before it: a short or elliptical turn completes the question it answers, and its meaning (and every reading you offer for it) is that completed meaning, about who the question was about.",
		"",
		`A fluent version of the writer's turns, each written as it would have been said at that moment, for comparison (not to be copied wholesale):\n<<<\n${native}\n>>>`,
	].join("\n");
	const landed = evidence
		? `\n\nThe turns were sent and the others answered. Before the analysis, fill "turns": for each turn, read what the others said next as evidence of how it landed. outcome "as meant" or "off" (taken differently, colder or more negatively than the writer meant, a reply that has to ask what they meant or set straight something they seemed to say, or a question that wanted an answer got none; silence after thanks, an apology or a closing line is normal and "as meant"). cause, when off: "wording" (how it was said made them take it that way, including words too vague for them to tell what was meant, such as "the letters" when there were several: a spot must then cover those words), "content" (what was said, not how: a wrong fact, repeating what they already said, off topic; no spot for this, say it in why), "reader" (they misread something the wording made clear: no spot); "none" when as meant. why: one short sentence in ${fbName(d)}, pointing at the reply. The others may misread, and a turn that landed fine can still have a spot: judge the wording yourself. Never suggest the writer should have known something that was said only after their turn.`
		: "";
	const shape = evidence
		? SHAPE_V6.replace(/^\{/, `{"turns":[{"t":1,"outcome":"as meant|off","cause":"wording|content|reader|none","why":"..."}],`)
		: SHAPE_V6;
	const system = `You are a ${T} writing tutor. You help writers say what they mean, for the people who read them.`;
	const user = `${intro}\n\n${task}${landed}\n\nReply with JSON only. ${SCAN_RULE}\n${shape}`;
	const res = await chat(
		[
			{ role: "system", content: system },
			{ role: "user", content: user },
		],
		{ model, sample: 0, tag: evidence ? "q2/e" : "q2/p" },
	);
	let raw: unknown = null;
	try {
		raw = extractJson(res.text);
	} catch {}
	const parsed = ExchangeAnalysis.safeParse(raw);
	if (parsed.success) return { analysis: parsed.data, calls: [res], byTurn };
	const fixed = await chatJson(
		[
			{ role: "system", content: system },
			{ role: "user", content: user },
			{ role: "assistant", content: res.text },
			{ role: "user", content: `The JSON did not validate:\n${parsed.error.message}\nReply with the corrected JSON only.` },
		],
		ExchangeAnalysis,
		{ model, sample: 0, tag: "q2/repair" },
	);
	return { analysis: fixed.value, calls: [res, ...fixed.calls], byTurn };
}
