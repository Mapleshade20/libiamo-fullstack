import { z } from "zod";
import { type Caller, type CallResult, chatJson } from "#lib/server/llm/caller.ts";
import { aLearner, type Draft, fbName, LANG_NAMES, noteLines, pinLang } from "#lib/server/revision/draft.ts";
import { VOICE } from "#lib/server/revision/pass1/context.ts";
import type { Material } from "#lib/server/revision/pass2/material.ts";

/** The post with the learner's attempt in place of the spot, so tense and attachment are judged in context. */
export function withAttempt(text: string, replaces: string, attempt: string): string {
	const at = text.indexOf(replaces);
	if (at < 0) throw new Error(`replaces not found: ${replaces}`);
	return placeAt(text, at, at + replaces.length, attempt).text;
}

const END = /[.!?…。！？]+$/;
const ENDED = /[.!?…。！？]+["”’»)）」』]*$/;
/** A version that ends on an emoji has its own ending: no full stop after it ("whenever you have time 💕!"). */
const EMOJI_END = /\p{Extended_Pictographic}\uFE0F?$/u;
const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;

/**
 * Put a new version in place of text[from, to). Whether the learner typed the end mark never matters: a span that ended
 * its sentence keeps its mark, a span inside a sentence takes no full stop, and marks are never doubled. Spacing
 * follows the original (none between CJK words), and the first letter follows the sentence.
 */
export function placeAt(text: string, from: number, to: number, attempt: string): { text: string; from: number; to: number; placed: string } {
	const left = text.slice(0, from);
	// Trim spaces only: a paragraph break before the spot must survive.
	const before = left.replace(/[ \t]+$/, "");
	let after = text.slice(to);
	const span = text.slice(from, to).trim();
	let a = attempt.trim().replace(/\s+/g, " ");
	const ownEnd = span.match(END)?.[0] ?? "";
	const next = after.replace(/^[ \t]+/, "");
	const continues = /^[,;:、，；：]/.test(next) || (!ownEnd && /^\p{Ll}/u.test(next));
	if (continues) a = a.replace(/[.。]+$/, "");
	else if (ownEnd && !ENDED.test(a) && !EMOJI_END.test(a)) a += ownEnd;
	// The post's own mark right after the spot gives way to the one the learner typed.
	if (/^[.!?。！？]/.test(after) && ENDED.test(a)) after = after.slice(1);
	const starts = before === "" || /[.!?…。！？\n]["”’»)）」』]?$/.test(before);
	const first = a.match(/^[\p{L}]+/u)?.[0] ?? "";
	if (starts && /^\p{Ll}/u.test(a)) a = a[0].toUpperCase() + a.slice(1);
	// Mid-sentence, a capital the original did not have goes, unless the word is capitalised elsewhere (a name).
	else if (!starts && first && /^\p{Lu}\p{Ll}/u.test(first) && /^\p{Ll}/u.test(span) && !new RegExp(`[^.!?\\s]\\s+${first}\\b`, "u").test(text))
		a = a[0].toLowerCase() + a.slice(1);
	const spaced = /[ \t]$/.test(left) || (before !== "" && !/[\n(“"‘'—\-（「]$/.test(before) && !CJK.test(before.slice(-1)) && !CJK.test(a[0] ?? ""));
	const glue = /^[,.;:!?)、。，！？）]/.test(a) || !spaced || /\n$/.test(before) ? "" : " ";
	const out = `${before}${glue}${a}${after}`;
	const start = before.length + glue.length;
	return { text: out, from: start, to: start + a.length, placed: a };
}

const Other = z.object({ problem: z.string(), reader: z.string().nullable().optional(), hint: z.string(), tell: z.string() });
export const GradeSchema = z.object({
	reads_as: z.string().optional(),
	meaning_ok: z.boolean(),
	errors: z.array(z.object({ words: z.string(), fix: z.string(), why: z.string() })),
	check: z.number().nullable(),
	other: Other.nullable().optional(),
	verdict: z.enum(["pass", "retry"]).optional(),
	/** g3: one flag per numbered likely mistake, and what of the meaning is missing; code derives the verdict. */
	hits: z.array(z.boolean()).optional(),
	missing: z.array(z.string()).optional(),
	ticks: z.array(z.number()).default([]),
	own: z.string().nullable().optional(),
	/**
	 * g3: the learner's version against each numbered choice of the reference, so the explanation is one list: each row
	 * the reference's reason, and where theirs differs, theirs beside it. Code derives ticks from it.
	 */
	choices: z
		.array(
			z.object({
				n: z.number(),
				mine: z.string().nullable().optional(),
				verdict: z.enum(["same", "also", "needed", "missing"]),
				note: z.string().nullable().optional(),
			}),
		)
		.optional(),
	/** Their choices no numbered choice covers that are still worth a word. */
	extra: z.array(z.object({ mine: z.string(), ref: z.string(), ok: z.boolean().optional(), note: z.string() })).optional(),
	/** On a retry: what the tutor says, about their words. */
	tutor: z.string().nullable().optional(),
	/** On a retry: their version with the smallest changes that make it pass; the hint ladder is built from it. */
	repaired: z.string().nullable().optional(),
});
export type Grade = z.infer<typeof GradeSchema>;

/** problem: what was wrong with the original part; the new version must fix exactly that. */
export type GradeInput = {
	reading: string;
	problem: string;
	material: Material;
	attempt: string;
	earlier?: (string | { text: string; feedback: string })[];
};

export async function grade(
	d: Draft,
	text: string,
	g: GradeInput,
	ai: Caller,
	opts: { strategy: "g1" | "g2" | "g3"; sample?: number; effort?: "low" | "medium" },
): Promise<{ value: Grade; calls: CallResult[] }> {
	const T = LANG_NAMES[d.target];
	const L = LANG_NAMES[d.learner];
	const F = fbName(d);
	const m = g.material;
	const round = (g.earlier?.length ?? 0) + 1;
	const system = `You grade one rewritten spot in ${aLearner(d)}'s ${T} post before they publish it. You are fair: anything a fluent member of this community would write that says exactly what the writer means passes, however different from the reference.`;
	const context = [
		`Where it will be posted: ${d.scene.platform}. Readers: ${d.scene.audience}.`,
		...noteLines(d),
		`What the writer means here (confirmed by them): ${g.reading}`,
		`The part they are rewriting was: "${m.replaces.trim()}"`,
		`What was wrong with it, which the new version must fix: ${g.problem}`,
		`Reference version: "${m.ref.replace(/[[\]]/g, "")}"${m.alts.length ? `\nAlso fine: ${m.alts.map((a) => `"${a}"`).join("; ")}` : ""}${/⟨[^⟩]+⟩/.test(m.ref) ? "\nA ⟨…⟩ in it stands for something only the writer knows (which scene, what happened): whatever fitting content they put there is right, and it is never wrong to differ from the placeholder's words; leaving it out entirely is missing." : ""}`,
		"",
		`Likely mistakes, numbered:\n${m.checks.map((c, i) => `${i + 1}. ${c.problem}`).join("\n")}`,
		"",
		`Choices in the reference, numbered, each with the reason the tutor gave for it:\n${m.why.map((w, i) => `${i + 1}. ${w.label}: ${w.note}`).join("\n")}`,
		g.earlier?.length
			? `\nTheir earlier tries at this spot, and what the tutor told them:\n${g.earlier.map((e) => (typeof e === "string" ? `- ${e}` : `- "${e.text}" → tutor: ${e.feedback}`)).join("\n")}`
			: "",
		"",
		`The learner's new version: "${g.attempt}"`,
		"",
		"The post with it in place:",
		"<<<",
		withAttempt(text, m.replaces, g.attempt),
		">>>",
	]
		.filter((l) => l !== "")
		.join("\n");
	const rules = `Rules:
- verdict "pass" when a fluent reader would take away the writer's meaning (nothing missing, nothing added that changes it) and nothing in the new version is wrong or unnatural enough that a careful native editor would change it. Matters of taste are not errors. Otherwise "retry".
- A tense that does not fit the surrounding post (present in a past narrative, or the reverse) is an error.
- A word that says something other than what the writer means is an error even when it is fluent (a near-synonym with another sense, a pronoun whose referent becomes unclear).
- Sentence-final punctuation is placed automatically when the version goes into the post: whether the learner typed a full stop (or other final mark) at the very end is never an error and never a reason to retry.
- errors: only real ${T} errors in the new version (grammar, wrong word, a structure carried over from ${L}), each with the exact words, the fix, and why (the why always in ${F}). Not differences from the reference.
- ${VOICE(d)} Never count those as errors.
- check: the number of the most important likely mistake the new version makes, or null.
- other: when something is missing or wrong and no numbered mistake fits, describe the problem: problem (English), reader (optional, one ${T} line in character, only when the meaning suffers), hint (${F}: points at the gap without giving the words), tell (${F}: the fix plainly). Else null.
- ticks: numbers of the reference's choices the new version also makes, or makes an equally good equivalent of.
- own: when the learner made a good choice of their own that differs from the reference, one ${F} sentence saying why it works; else null.
- choices: one entry per numbered choice of the reference, in order: n; mine: the learner's exact words doing the same job, or null if their version does not do it; verdict: "same" (they made this choice, or one no reader would tell apart: two coordinated words in another order, an article, a contraction, a synonym with no difference here), "also" (a different choice that is just as right here), "needed" (a different choice, and the reference's is needed). The tutor's reasons are claims, not facts: "needed" only when the reason really holds for their words; when it does not (their words are not wrong or unnatural here), the verdict is "also", "missing" (their version does not do this job); note: only for "also" and "needed", in ${F}, one or two sentences on what their words say or imply here next to the reference's, so they see exactly how the two differ (for "needed", why the reference's choice is needed). Do not repeat the reason the tutor gave; add only what is about their words. When the reason criticised words they kept and it does not hold, the note says so plainly.
- extra: other places where their version differs from the reference in a way worth a word and no numbered choice covers it (at most two): mine, ref (the reference's words for the same job), ok, note (${F}, as above). Never a difference no reader would notice. [] if none.
- tutor: null when nothing above is a problem. Otherwise what the tutor says to the learner now, in ${F}, addressing them informally, at most two sentences: quote their exact words that need work and say concretely what a reader takes from them versus what they mean (or what is missing, naming the idea, not the ${T} words). This is try number ${round}: ${round === 1 ? "point at the problem without giving the replacement words." : "they have tried before, so be more explicit: give the key word or structure they need."} Never repeat what the tutor already said to them; never generic advice like "check your meaning".
- repaired: null when nothing above is a problem. Otherwise their version with the smallest changes that fix every problem above: keep their words, word order and structure wherever they work; add what is missing in the same style. It covers exactly the stretch their version covers: never copy in text from the post before or after it.
- ${pinLang(d)}`;
	const g3 = `First write reads_as: in English, what a reader takes this new version to say, as they would understand it in the post.
Then missing: the parts of the writer's meaning, or of what the original part said and the reference keeps, that the new version leaves out (short English phrases; [] if none). Count meaning, not words: dropping a word that does not change what a reader takes away is fine. If the original's problem was that something was only implied, it is still missing while it is only implied.
Then hits: for each numbered likely mistake, in order, true if the new version makes it.
Then errors, other, choices, extra, tutor and repaired as above; there is no verdict field and no ticks field.

Reply with JSON only, fields in this order: {"reads_as":"","missing":[],"hits":[${m.checks.map(() => "false").join(",")}],"meaning_ok":true,"errors":[{"words":"","fix":"","why":""}],"check":null,"other":null,"choices":[${m.why.map((_, i) => `{"n":${i + 1},"mine":null,"verdict":"same","note":null}`).join(",")}],"extra":[],"tutor":null,"repaired":null}
Each extra item, if any, is {"mine":"","ref":"","ok":true,"note":""}.`;
	const shape =
		opts.strategy === "g3"
			? g3
			: opts.strategy === "g2"
				? `First write reads_as: in English, what a reader takes this new version to say, as they would understand it in the post. Then judge.\n\nReply with JSON only, fields in this order: {"reads_as":"","meaning_ok":true,"errors":[{"words":"","fix":"","why":""}],"check":null,"other":null,"verdict":"pass|retry","ticks":[],"own":null}`
				: `Reply with JSON only: {"verdict":"pass|retry","meaning_ok":true,"errors":[{"words":"","fix":"","why":""}],"check":null,"other":null,"ticks":[],"own":null}`;
	const res = await chatJson(
		[
			{ role: "system", content: system },
			{ role: "user", content: `${context}\n\n${rules}\n\n${shape}` },
		],
		GradeSchema,
		{ ai, sample: opts.sample, effort: opts.effort ?? "low", tag: `e4/${opts.strategy}` },
	);
	res.value = settle(res.value);
	return res;
}

/** The model reports evidence, code decides. Any hit, missing part, error or picked check means another round. */
export function settle(g: Grade): Grade {
	const hit = (g.hits ?? []).findIndex(Boolean);
	// Any evidence of a problem means another round, whatever verdict the model wrote (g1/g2 can contradict themselves).
	const failed = hit >= 0 || (g.missing ?? []).length > 0 || g.errors.length > 0 || !g.meaning_ok || g.check != null || g.verdict === "retry";
	// Ticks are the reference's choices the learner made, or made equally well.
	const ticks = g.choices ? g.choices.filter((c) => c.verdict === "same" || c.verdict === "also").map((c) => c.n) : g.ticks;
	// An extra item about words a row already discusses says it twice.
	const said = new Set((g.choices ?? []).map((c) => c.mine?.trim().toLowerCase()).filter(Boolean));
	const extra = g.extra?.filter((x) => !said.has(x.mine.trim().toLowerCase())).map((x) => ({ ...x, ok: x.ok ?? true }));
	return { ...g, ticks, extra, verdict: failed ? "retry" : "pass", check: hit >= 0 ? hit + 1 : g.check };
}

/** What the session shows after a retry verdict; code owns the round logic (hint first, then tell). */
export function feedback(m: Material, g: Grade, round: number): { reader?: string; tutor: string } | null {
	if (g.verdict === "pass") return null;
	const c = g.check ? m.checks[g.check - 1] : undefined;
	const src =
		c ??
		g.other ??
		(g.errors[0] ? { reader: null, hint: g.errors[0].why, tell: `${g.errors[0].words} → ${g.errors[0].fix}：${g.errors[0].why}` } : null);
	// The grader's own line is about the words the learner wrote; the prepared hints are the fallback.
	const tutor = g.tutor?.trim() || (src ? (round >= 2 ? src.tell : src.hint) : "");
	return { reader: round === 1 ? (src?.reader ?? undefined) : undefined, tutor };
}
