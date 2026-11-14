import { z } from "zod";
import { type Caller, type CallResult, chat, chatJson } from "#lib/server/llm/caller.ts";
import { type Draft, fbName, LANG_NAMES } from "#lib/server/revision/draft.ts";
import { DRAFT_CONVENTIONS, draftBlock, ROUTING, VOICE } from "#lib/server/revision/pass1/context.ts";
import { align, CLOSE, type Hunk, markup, OPEN, type Open } from "#lib/text/diff.ts";

/** One problem as a range of the draft, whatever strategy found it. */
/** tier "better": fine as written, but worth it for a writer who asked for more (an optional change, or a spot the judge rated so). */
export type Finding = {
	from: number;
	to: number;
	before: string;
	after?: string;
	pass: 1 | 2;
	kind?: string;
	optional?: boolean;
	try?: boolean;
	note: string;
	prompt?: string;
	accept?: string[];
	tier?: "better";
};
export type Pass1Run = { findings: Finding[]; calls: CallResult[]; artifacts: Record<string, string> };

const NOTE_STYLE = (d: Draft) =>
	`Notes are for the writer, in ${fbName(d)}, one or two short sentences. Be specific: say how the original reads to a ${LANG_NAMES[d.target]} reader (a wrong connotation, a different meaning, a rule it breaks) and what the fix does. Quote ${LANG_NAMES[d.target]} words as they are. No praise, no filler.`;

// The labelling call over code-computed hunks (the scenario and translation passes share it).
const LabelSchema = z.object({
	hunks: z.array(
		z.object({
			id: z.number(),
			change: z.string().optional(),
			kind: z.enum(["grammar", "word", "mechanics", "hole", "hesitation"]),
			pass: z.union([z.literal(1), z.literal(2)]),
			optional: z.boolean(),
			try: z.boolean(),
			note: z.string(),
			prompt: z.string().nullable().optional(),
			accept: z.array(z.string()).nullable().optional(),
		}),
	),
	opens: z.array(z.object({ id: z.number(), note: z.string() })),
});

export async function label(d: Draft, hunks: Hunk[], opens: Open[], ai: Caller, sample: number, tag: string) {
	const system = `You are a ${LANG_NAMES[d.target]} writing tutor. A first pass over a learner's draft has been made; you explain it to the learner.\n\n${DRAFT_CONVENTIONS(d)}\n\n${ROUTING}\n\n${VOICE(d)}\n\n${NOTE_STYLE(d)}`;
	const user = `${draftBlock(d)}\n\nThe first pass, shown on the draft. [#n before → after] is a change; ⟦#n …⟧ is a span left for pass 2.\n\n${markup(d.text, hunks, opens)}\n\nFor every change give, in this order:\n- change: the change copied from the markup as "before → after", so the label stays attached to it\n- kind: grammar | word (word choice, connotation, idiom) | mechanics (capitalisation, spelling, punctuation) | hole (an untranslated passage filled in) | hesitation (an "a/b" choice resolved)\n- pass: 1, or 2 if on reflection the fix depends on the writer's intent: in particular when the original could be taken another way than meant (a different attitude, act, claim or strength, as the routing rule defines it) and the change picks one meaning\n- optional: true when the original was acceptable and the change is only a preference\n- try: true when the learner could likely make this fix themselves given a nudge (a rule they know: tense, agreement, article, word form), false when they need to be told (an idiom, a connotation) and always false for punctuation-only changes\n- prompt: for try items, the nudge in ${fbName(d)}: what kind of problem it is and where to look, never the answer; else null\n- accept: for try items, every replacement a learner might type that is equally correct here (including the one above); else null\n- note\nFor every pass-2 span give a note, in ${fbName(d)}, saying how a reader takes it as written and why that is a problem (it becomes the problem pass 2 shows the writer): never a fix, a choice of fixes, or words that are not in the draft.\n\nReply with JSON only: {"hunks":[{"id":1,"change":"before → after","kind":"...","pass":1,"optional":false,"try":false,"prompt":null,"accept":null,"note":"..."}],"opens":[{"id":1,"note":"..."}]}`;
	return chatJson(
		[
			{ role: "system", content: system },
			{ role: "user", content: user },
		],
		LabelSchema,
		{ ai, sample, tag },
	);
}

export function merge(hunks: Hunk[], opens: Open[], labels: z.infer<typeof LabelSchema>): Finding[] {
	const out: Finding[] = [];
	// Models sometimes shift labels by one in long lists; the echoed change text wins over the id.
	const norm = (x: string) => x.replace(/[\s"“”'’]/g, "").toLowerCase();
	const byText = (h: Hunk) => labels.hunks.find((x) => x.change && norm(x.change) === norm(`${h.before || "∅"}→${h.after.trim() || "∅"}`));
	for (const h of hunks) {
		// Whitespace-only changes are not changes.
		if (h.before.trim() === h.after.trim()) continue;
		const l = byText(h) ?? labels.hunks.find((x) => x.id === h.id);
		out.push({
			from: h.from,
			to: h.to,
			before: h.before,
			after: h.after,
			pass: l?.pass ?? 1,
			kind: l?.kind,
			optional: l?.optional,
			try: l?.try,
			note: l?.note ?? "(unlabelled)",
			prompt: l?.prompt ?? undefined,
			accept: l?.accept ?? undefined,
		});
	}
	for (const o of opens)
		out.push({ from: o.from, to: o.to, before: o.text, pass: 2, note: labels.opens.find((x) => x.id === o.id)?.note ?? "(unlabelled)" });
	return out.sort((a, b) => a.from - b.from);
}

export const MARK_RULES = `Wrap each pass-2 span in ${OPEN} ${CLOSE}, leaving its text exactly as the writer wrote it. Everything that has no problem stays character-for-character as in the draft: same paragraphs, punctuation, quote marks and emoji.`;

// The native version first (what a fluent poster would write), then the pass-1 version against it.
/** The rewrite (which pass 2 reads) resolves before its labels (which only pass 1's cards need). */
export function rewritePass1(d: Draft, ai: Caller, sample: number) {
	const system = `You are a ${LANG_NAMES[d.target]} writing tutor making the first pass over a learner's draft before they post it.\n\n${DRAFT_CONVENTIONS(d)}\n\n${ROUTING}\n\n${VOICE(d)}`;
	const user = `${draftBlock(d)}\n\nWork in two steps.\n\nStep 1. Under the heading "### NATIVE", write the post as a fluent ${LANG_NAMES[d.target]} speaker of this community would write it, saying what this writer wants to say, in their voice and at their length. Where their intent is unclear, make your best guess.\n\nStep 2. Under the heading "### PASS 1", write out the draft after pass 1. Use your native version to notice everything in the draft that is not how it would naturally be said, then fix every pass-1 problem in place. ${MARK_RULES}\n\nReply with the two sections only.`;
	const rewrite = chat(
		[
			{ role: "system", content: system },
			{ role: "user", content: user },
		],
		{ ai, sample, tag: "e1/s3/rewrite" },
	).then((res) => ({ res, native: section(res.text, "NATIVE"), pass1: section(res.text, "PASS 1") }));
	const done = rewrite.then(async ({ res, native, pass1 }): Promise<Pass1Run> => {
		const { hunks, opens } = align(d.text, pass1, d.target);
		const labels = await label(d, hunks, opens, ai, sample, "e1/s3/label");
		return { findings: merge(hunks, opens, labels.value), calls: [res, ...labels.calls], artifacts: { native, rewrite: pass1 } };
	});
	rewrite.catch(() => {});
	done.catch(() => {});
	return { rewrite, done };
}

function stripFence(t: string): string {
	return t
		.replace(/^\s*```\w*\n/, "")
		.replace(/\n```\s*$/, "")
		.trim();
}

export function section(text: string, name: string): string {
	const m = text.match(new RegExp(`###\\s*${name}\\s*\\n([\\s\\S]*?)(?=\\n###\\s|$)`));
	if (!m) throw new Error(`section ${name} missing`);
	return stripFence(m[1].trim())
		.replace(/^<<<\s*|\s*>>>$/g, "")
		.trim();
}
