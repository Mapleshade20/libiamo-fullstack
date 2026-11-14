// A finished scenario's exchange as the revision passes see it (item 2: scenarios into the two-pass revision). The learner's
// turns are the draft, one paragraph block per turn between separator lines; the others' messages stay beside it, in
// order, as context (Q1: listing the learner's lines first and the replies after them made the models use replies the
// learner had not seen yet).
import { type Caller, type CallResult, chat } from "#lib/server/llm/caller.ts";
import { type Draft, LANG_NAMES } from "#lib/server/revision/draft.ts";
import { DRAFT_CONVENTIONS, draftBlock, ROUTING, VOICE } from "#lib/server/revision/pass1/context.ts";
import { label, MARK_RULES, merge, type Rewrite, section } from "#lib/server/revision/pass1/rewrite.ts";
import { align } from "#lib/text/diff.ts";

export type Msg = { id: string; author: string; text: string; replyTo?: string | null; learner?: boolean };
export type Case = {
	id: string;
	place: "reddit" | "discord" | "ao3" | "mail" | "imessage" | "translate";
	lang: string;
	scene: { platform: string; where: string; you: string; goals: string[]; cast: { name: string; who: string }[] };
	/** What was there before the learner wrote. */
	before: Msg[];
	/** The session itself: the learner's turns and the others' messages, in order. */
	transcript: Msg[];
	notes: string;
};

export const SEP = "* * *";

/** A mail turn as the learner wrote it: the subject stays (it is theirs to get right), the To line goes. */
export const own = (m: Msg) => m.text.replace(/^To:.*\n/m, "").trim();
export const turns = (c: Case) => c.transcript.filter((m) => m.learner);

export function draftOf(c: Case, text = turns(c).map(own).join(`\n\n${SEP}\n\n`)): Draft {
	return {
		id: c.id,
		text,
		target: c.lang as Draft["target"],
		learner: "zh-CN",
		level: "",
		scene: {
			platform: `${c.scene.platform} (${c.scene.where})`,
			audience: c.scene.cast.map((p) => `${p.name}, ${p.who}`).join("; "),
			purpose: `${c.scene.you}. Goals: ${c.scene.goals.join("; ")}`,
		},
	};
}

/**
 * Everything in order, the learner's turns numbered as they stand in the draft. `mine` replaces a turn's text (the
 * pass-1 version, numbered sentences); `upTo` stops after the given turn.
 */
export function exchange(c: Case, opts: { mine?: (n: number, m: Msg) => string; upTo?: number } = {}): string {
	const name = new Map([...c.before, ...c.transcript].map((m) => [m.id, m.author]));
	let t = 0;
	const out: string[] = c.before.map((m) => line(m));
	out.push("--- the writer joins ---");
	for (const m of c.transcript) {
		if (m.learner && opts.upTo !== undefined && t >= opts.upTo) break;
		out.push(line(m));
	}
	return out.join("\n\n");
	function line(m: Msg) {
		const to = m.replyTo && name.get(m.replyTo) ? ` (replying to ${name.get(m.replyTo)})` : "";
		if (!m.learner) return `${m.author}${to}:\n${m.text}`;
		t++;
		return `[T${t}] THE WRITER${to}:\n${opts.mine ? opts.mine(t, m) : own(m)}`;
	}
}

/** Which turn (1-based) a position in the draft (turns joined by separator lines) falls in. */
export function turnAt(text: string, pos: number): number {
	return text.slice(0, Math.max(0, pos)).split(`\n\n${SEP}\n\n`).length;
}

/** Who answered turn n, and how: the first message after it that replies to it, else the next one from someone else. */
export function replyTo(c: Case, n: number): Msg | undefined {
	const all = c.transcript;
	const mine = all.filter((m) => m.learner);
	const turn = mine[n - 1];
	if (!turn) return undefined;
	const after = all.slice(all.indexOf(turn) + 1);
	const nextMine = after.findIndex((m) => m.learner);
	const window = nextMine < 0 ? after : after.slice(0, nextMine);
	return window.find((m) => m.replyTo === turn.id) ?? window[0];
}

/**
 * Pass 1 over the exchange: each turn written natively as it would have been said then, and the draft fixed against it.
 * `rewrite` resolves first (pass 2's analysis compares with its native version while the labels are written).
 */
export function pass1Exchange(c: Case, ai: Caller, d: Draft = draftOf(c), given?: Rewrite) {
	const block = `${draftBlock(d)}\n\nThe draft is the writer's turns in a conversation that has already happened, in order, separated by lines "${SEP}". Here is the whole exchange, so you know what each turn answers and what the others said in between (their messages are context, not part of the draft):\n<<<\n${exchange(c)}\n>>>`;
	const system = `You are a ${LANG_NAMES[d.target]} writing tutor going over what a learner wrote in an online conversation, so they can say it better next time.\n\n${DRAFT_CONVENTIONS(d)}\n\n${ROUTING}\n\n${VOICE(d)}`;
	const user = `${block}\n\nWork in two steps.\n\nStep 1. Under the heading "### NATIVE", write each of the writer's turns as a fluent ${LANG_NAMES[d.target]} speaker of this community would have written it at that moment, saying what the writer wanted to say there, in their voice and at their length, knowing only what had been said up to that turn. Keep the "${SEP}" lines between turns.\n\nStep 2. Under the heading "### PASS 1", write out the draft after pass 1. Use your native version to notice everything in the draft that is not how it would naturally be said, then fix every pass-1 problem in place. ${MARK_RULES} Keep the "${SEP}" lines exactly.\n\nReply with the two sections only.`;
	const rewrite: Promise<{ res: CallResult | null; native: string; pass1: string }> = given
		? Promise.resolve({ res: null, native: given.native ?? "", pass1: given.pass1 })
		: chat(
				[
					{ role: "system", content: system },
					{ role: "user", content: user },
				],
				{ ai, sample: 0, tag: "q1/b/rewrite" },
			).then((res) => ({ res, native: section(res.text, "NATIVE"), pass1: section(res.text, "PASS 1") }));
	const done = rewrite.then(async ({ res, native, pass1 }) => {
		const { hunks, opens } = align(d.text, pass1, d.target);
		const labels = await label({ ...d, brief: exchange(c) }, hunks, opens, ai, 0, "q1/b/label");
		return { d, native, pass1, findings: merge(hunks, opens, labels.value), calls: [...(res ? [res] : []), ...labels.calls] };
	});
	rewrite.catch(() => {});
	done.catch(() => {});
	return { rewrite, done };
}
