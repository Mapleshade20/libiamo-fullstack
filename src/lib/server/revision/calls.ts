import { z } from "zod";
import { around, unmark } from "#lib/review/faces.ts";
import { type Caller, chat, chatJson } from "#lib/server/llm/caller.ts";
import { aLearner, cap, type Draft, fbName, LANG_NAMES, type Lang, noteLines, pinLang, readerFrame } from "#lib/server/revision/draft.ts";
import { readerSeat } from "#lib/server/revision/pass2/analyze.ts";
import type { Material } from "#lib/server/revision/pass2/material.ts";
import { words } from "#lib/text/words.ts";
import type { NoteBody } from "#lib/writing/types.ts";

// C0: the scene card. The learner sees and may correct it; everything downstream reads it.
const SceneSchema = z.object({
	site: z.string().optional(),
	community: z.string().optional(),
	reader: z.string().optional(),
	title: z.string().optional(),
	platform: z.string(),
	audience: z.string(),
	purpose: z.string(),
});
/** The language is the piece's (the composer's door named it), never guessed here: every language learnt here has one. */
export async function inferScene(
	text: string,
	background: string | undefined,
	learner: Lang,
	target: Lang,
	feedback: "native" | "target",
	ai: Caller,
) {
	// In "target" mode the writer reads everything in the language they are writing in.
	const F = LANG_NAMES[feedback === "native" ? learner : target];
	const user = `A language learner (their own language: ${LANG_NAMES[learner]}) pasted a draft in ${LANG_NAMES[target]}, the language they are learning, that they are about to post or send, with an optional note.\n\nNote: ${background ?? "(none)"}\n\nDraft:\n<<<\n${text}\n>>>\n\nSay where it will be posted (platform and kind of post), who will read it and what the writer wants to do. platform, audience and purpose in ${F} (the writer reads them), whatever language the note is in, a short phrase each (at most about twelve words). The purpose says only what the draft and note show the writer doing; never add aims they do not show.\nAlso give site: the site or medium's short name as its users write it (a site name, or "Email"); community: where on it, as its users write it (a subreddit like r/name, a fic's title, a recipient), short; and reader: a plausible handle or name for one typical reader there, written the way that site shows names.\nAnd title: the piece as an item on the writer's list, in ${LANG_NAMES[target]}, starting with a verb, the way writing prompts are titled (for example "Reply to the author of “Long Way Home”", "Ask r/WarriorCats why StarClan never came", "Thank Sam for the playlist"); at most about eight words, naming who or what it is for.\nReply with JSON only: {"site":"","community":"","reader":"","title":"","platform":"","audience":"","purpose":""}`;
	const scene = (await chatJson([{ role: "user", content: user }], SceneSchema, { ai, effort: "low", tag: "session/scene" })).value;
	return { ...scene, target };
}

// After the reader's read-back: the tutor answers the learner's confirmation or correction.
const OverviewSchema = z.object({
	reply: z.string(),
	gist: z.string(),
	newSpot: z.object({ where: z.string(), problem: z.string(), reading: z.string() }).nullable().optional(),
});
export async function overviewReply(d: Draft, text: string, readBack: string, gist: string, learnerSaid: string | null, ai: Caller) {
	const L = fbName(d);
	const user = [
		...noteLines(d),
		`The post (${d.scene.platform}):`,
		"<<<",
		text,
		">>>",
		"",
		`A reader replied: "${readBack}"`,
		`The tutor's reading of what the post is really about: ${gist}`,
		learnerSaid ? `The writer says that is not quite it: "${learnerSaid}"` : "The writer confirmed the reader got it.",
		"",
		`As the tutor, reply to the writer in ${L}, addressing them informally as a friendly tutor would, two or three short sentences: say plainly what the post's real point is${learnerSaid ? " now that they have said it" : ""}, and whether the post as written gets that across; then lead into the map of the post that follows. No praise, no filler.`,
		learnerSaid
			? `If what the writer said is a point the post never states, give newSpot: where it belongs (exact words of the post it should follow or replace), the problem (${L}), and the reading (${L}, what they mean). Else null.`
			: "newSpot: null.",
		`gist: the post's real point in one ${L} sentence.`,
		pinLang(d),
		'Reply with JSON only: {"reply":"","gist":"","newSpot":null}',
	].join("\n");
	return (await chatJson([{ role: "user", content: user }], OverviewSchema, { ai, effort: "low", tag: "session/overview" })).value;
}

/** The import itself, first, so the calls that carry it share a cached prefix. */
const importBlock = (source?: string) =>
	source ? `What the writer imported as context, copied from elsewhere (reference material, not their writing):\n<<<\n${source}\n>>>\n\n` : "";

// R1: the learner typed what they mean instead of picking a reading. They may instead be saying the tutor misread the
// spot (a name the tutor did not know, a line that is fine as it is): then nothing here needs fixing.
export async function ownReading(d: Draft, text: string, spotText: string, problem: string, said: string, ai: Caller, source?: string) {
	const L = fbName(d);
	const user = `${importBlock(source)}${[...noteLines(d), `The writer's ${LANG_NAMES[d.target]} post (${d.scene.platform}):`, "<<<", text, ">>>"].join("\n")}\n\nThey are fixing this part of it: "${spotText}"\nThe problem the tutor saw there: ${problem}\nAsked what they mean, they wrote: "${said}"\n\nfine: true when what they wrote says the problem is not real (the part already says what they mean, or the tutor misread it), so the part can stay as it is; false when they are telling you what they mean.\nreading: what they mean, as one clear ${L} sentence (keep their meaning, do not add to it).\nreply: to them in ${L}, one short sentence, informally: confirm what they mean, or, when fine, agree that the part can stay as it is.\n${pinLang(d)}\nReply with JSON only: {"fine":false,"reading":"","reply":""}`;
	return (
		await chatJson([{ role: "user", content: user }], z.object({ fine: z.boolean().default(false), reading: z.string(), reply: z.string() }), {
			ai,
			effort: "low",
			tag: "session/own",
		})
	).value;
}

// R3: 我有疑问 — the learner questions the sentence or asks anything about it. The question may show that the tutor and
// the learner were not talking about the same thing: the reference was wrong, or the learner meant something else.
const QuestionSchema = z.object({
	answer: z.string(),
	kind: z.enum(["explain", "ref", "meaning", "keep"]),
	revisedRef: z.string().nullable().optional(),
	meaning: z.string().nullable().optional(),
});
export type QuestionContext = { reading: string; problem: string; history: { text: string; feedback: string }[] };
export async function answerQuestion(
	d: Draft,
	text: string,
	m: Material,
	mine: string | null,
	question: string,
	ctx: QuestionContext,
	ai: Caller,
	source?: string,
) {
	const F = fbName(d);
	const T = LANG_NAMES[d.target];
	const user =
		importBlock(source) +
		[
			`${cap(aLearner(d))} of ${T} (own language ${LANG_NAMES[d.learner]}) is rewriting part of a post for ${d.scene.platform}.`,
			...noteLines(d),
			"The post as it stands:",
			"<<<",
			text,
			">>>",
			`Original part: "${m.replaces}"`,
			`What was wrong with it: ${ctx.problem}`,
			`What the learner confirmed they mean: ${ctx.reading}`,
			ctx.history.length ? `Their tries so far and what the tutor said:\n${ctx.history.map((h) => `- "${h.text}" → ${h.feedback}`).join("\n")}` : "",
			`Reference version: "${m.ref.replace(/[[\]]/g, "")}"`,
			`Why the reference chooses what it does:\n${m.why.map((w) => `- ${w.label}: ${w.note}`).join("\n")}`,
			mine ? `Their accepted version: "${mine}"` : "They asked for the reference instead of writing their own.",
			"",
			`They now say or ask: "${question}"`,
			"",
			"First decide kind:",
			`- "meaning": they mean something other than the meaning above (they correct what the sentence should say). Give meaning: what they mean now, one clear ${F} sentence.`,
			`- "ref": they point out a real problem with the reference (wrong, unnatural, not what they mean in a detail, or they ask for a change such as shorter that suits the post). Give revisedRef: the corrected reference, two to four key words in [brackets].`,
			`- "keep": they say the original part needs no change at all (the problem is not real, or they do not want this change).`,
			`- "explain": anything else (a question about a word, a choice, a rule, or whether their own wording works).`,
			`Then answer: as their tutor, in ${F}, informally, direct and concrete, at most four sentences, with a short ${T} example if it helps. For "meaning", say plainly that the sentence must then say something else and that you will redo it; for "ref", say what you changed; for "keep", say whether the original works for readers as it is, honestly, and that they can keep it. ${pinLang(d)}`,
			'Reply with JSON only, fields in this order: {"kind":"explain|ref|meaning|keep","meaning":null,"revisedRef":null,"answer":""}',
		]
			.filter((l) => l !== "")
			.join("\n");
	return (await chatJson([{ role: "user", content: user }], QuestionSchema, { ai, tag: "session/question2" })).value;
}

// After the reference was revised in answer to a question: the explanation is redone for the new reference.
const ExplainSchema = z.object({ why: z.array(z.object({ label: z.string(), note: z.string() })), alts: z.array(z.string()), construct: z.string() });
export async function explainRef(
	d: Draft,
	text: string,
	m: Material,
	ref: string,
	mine: string | null,
	ctx: { reading: string; problem: string },
	ai: Caller,
) {
	const F = fbName(d);
	const T = LANG_NAMES[d.target];
	const user = `${[...noteLines(d), `${cap(aLearner(d))} of ${T} is revising this post for ${d.scene.platform}:`, "<<<", text, ">>>"].join("\n")}\n\nThey rewrote this part of it: "${m.replaces}"\nWhat was wrong with it: ${ctx.problem}\nWhat they mean (confirmed by them): ${ctx.reading}\nThe new reference version: "${ref}"\n${mine ? `Their own version: "${mine}"\n` : ""}\nExplain the reference: why, one entry per choice in it that the learner might not make themselves (label: the ${T} words, exactly as in the reference; note in ${F}: why this choice here, contrasted with what they wrote or would likely write; concrete, never "more natural" alone). alts: one or two other natural ways to say it. construct: the one reusable pattern it teaches, at most eight words, a ${T} frame with one placeholder. ${pinLang(d)}\nReply with JSON only: {"why":[{"label":"","note":""}],"alts":[],"construct":""}`;
	return (await chatJson([{ role: "user", content: user }], ExplainSchema, { ai, effort: "low", tag: "session/explain" })).value;
}

// R4: the reader reacts to the finished post.
export async function closingReaction(d: Draft, text: string, ai: Caller) {
	const system = readerSeat(d);
	const frame = readerFrame(d);
	const user = `${frame ? `${frame}\n\nThe post (the reply):\n` : ""}${d.title ? `${d.title}\n\n` : ""}${text}\n\nYou just read this post. Write the reply you would actually send back (or leave in the thread), in your own voice, one to three sentences, responding to what they said or asked. Reply with the reply only.`;
	return (
		await chat(
			[
				{ role: "system", content: system },
				{ role: "user", content: user },
			],
			{ ai, effort: "low", tag: "session/closing" },
		)
	).text.trim();
}

// C6: before posting, compare the final post with the corrected one: nothing the writer meant may be lost or bent.
const CheckSchema = z.object({
	issues: z.array(z.object({ kind: z.enum(["lost", "changed", "duplicated", "broken"]), quote: z.string(), note: z.string() })),
});
export async function contentCheck(d: Draft, before: string, after: string, decided: string[], ai: Caller) {
	const L = fbName(d);
	const user = `A writer revised their ${LANG_NAMES[d.target]} post sentence by sentence. Compare the version before the revision with the final one, as an editor protecting what the writer meant.\n\nBefore:\n<<<\n${before}\n>>>\n\nFinal:\n<<<\n${after}\n>>>\n${decided.length ? `\nDuring the revision the writer confirmed what they meant at these places; changes that follow these are intended:\n${decided.map((x) => `- ${x}`).join("\n")}\n` : ""}\nList only real problems in the final version: a point, detail, question or condition from before that is gone (lost); a claim whose meaning changed, e.g. a hedge or a hypothetical that became a flat statement (changed); text that appears twice (duplicated); a sentence that is broken where two pieces were joined (broken). Rewording, reordering and better phrasing are not problems. quote: the exact words from the final version (or, for lost, from before); note: one short ${L} sentence to the writer, informal. [] if there is nothing.\nReply with JSON only: {"issues":[{"kind":"lost|changed|duplicated|broken","quote":"","note":""}]}`;
	return (await chatJson([{ role: "user", content: user }], CheckSchema, { ai, effort: "low", tag: "session/check" })).value.issues;
}

// R5: the hint pieces, explained on demand: what each means and how it is used, with an example far from this post.
const PieceNotesSchema = z.object({ notes: z.array(z.object({ piece: z.string(), gloss: z.string(), example: z.string() })) });
/** ref: the sentence the pieces come from (never shown), so each is glossed in the sense it has there ("alone" as "only"). */
export async function pieceNotes(d: Draft, pieces: string[], ai: Caller, ref?: string) {
	const F = fbName(d);
	const T = LANG_NAMES[d.target];
	const sense = ref
		? `The sentence they are working towards, for you only (never quote it or give it away): "${ref}". Gloss each hint word in the sense it has in that sentence, not its most common sense ("alone" in "the clouds alone explain it" means "only", not "by oneself").\n\n`
		: "";
	const user = `${cap(aLearner(d))} of ${T} is rewriting part of a post. ${sense}Their hint words, exactly ${pieces.length}: ${pieces.map((p) => `"${p}"`).join(", ")}. "a / b" is a choice between two words.\n\nFor each of these hint words and no others, in this order: piece: the hint word as given. gloss: in ${F}, what it means here and how it is used, in one or two short sentences (the kind of word, what it goes with, register if it matters; for a choice, how the two differ). example: one short, natural ${T} sentence that uses it in the same sense, about everyday life and on a topic unrelated to the post (different people, events and subject), so it shows the word without giving away the sentence they are building.\nReply with JSON only: {"notes":[{"piece":"","gloss":"","example":""}]}`;
	return (await chatJson([{ role: "user", content: user }], PieceNotesSchema, { ai, effort: "low", tag: "session/pieces" })).value.notes;
}

/**
 * R6: the hint ladder (2026-11-07). It used to be the reference with its words masked (a skeleton, then first
 * letters, then the sentence itself): learners guessed letter counts, the function words left showing boxed in how
 * they could say it, and the last rung was the answer. A hint now removes what blocks them without dictating words:
 * first how the part is built (what comes first, how the parts connect: in their own language), then the same build
 * on another topic, a frame to borrow. The answer stays a separate choice. After a failed try both start from it.
 */
const HintSchema = z.object({ plan: z.string(), example: z.string() });
export async function hintFor(
	d: Draft,
	text: string,
	m: Material,
	ctx: { problem: string; reading: string; attempt?: string; feedback?: string },
	ai: Caller,
) {
	const F = fbName(d);
	const T = LANG_NAMES[d.target];
	const user = [
		...noteLines(d),
		`${cap(aLearner(d))} of ${T} is rewriting part of a post for ${d.scene.platform}:`,
		"<<<",
		text,
		">>>",
		`The part: "${m.replaces}"`,
		`What is wrong with it: ${ctx.problem}`,
		`What they mean (confirmed by them): ${ctx.reading}`,
		`A version that works (never show it or any stretch of it): "${m.ref.replace(/\[([^\]]+)\]/g, "$1")}"`,
		`Words they already have as hints: ${m.pieces.join(", ")}`,
		ctx.attempt ? `Their last try: "${ctx.attempt}"\nWhat the tutor told them about it: ${ctx.feedback ?? ""}` : "",
		"",
		`They are stuck. Write two hints that help them build it themselves, never giving them the wording:`,
		`- plan: in ${F}, one or two short sentences, as their tutor: how a fluent writer builds this part: what comes first, what follows, how the parts connect (contrast, cause, addition) and where the emphasis goes.${ctx.attempt ? " Start from their try: what to keep and what to build differently." : ""} Name no ${T} word except the hint words above (none from the working version), no letter counts, no fill-in blanks. It is about the words of this part, never the content they talk about ("first the interactions between them, then…" plans a story, not the sentence). When the part is a word or two (left in ${LANG_NAMES[d.learner]}, or a missing word), say what kind of word goes there and how it sits in the sentence.`,
		`- example: one short ${T} sentence a fluent writer would actually write (grammatical and natural on its own), about an everyday topic unrelated to the post (different people, things and events), built the same way as the working version: the same pattern and the same connecting words, none of its other content words. Put [square brackets] around the few words it shares with the working version as they are (the frame they can borrow, at most four), never around the words that change.`,
		`${pinLang(d)}`,
		'Reply with JSON only: {"plan":"","example":""}',
	]
		.filter((l) => l !== "")
		.join("\n");
	return (await chatJson([{ role: "user", content: user }], HintSchema, { ai, tag: "session/hint" })).value;
}

/**
 * The notebook entries for a finished piece (2026-11-07, chosen here since 2026-11-11). The entry used to be the
 * material's "construct", a fill-in frame with a gloss jammed into it; now each is the chunk itself as a learner would
 * file it, what it means here, how it is used (against what they first wrote), and three examples, translated.
 *
 * Which parts earn one is decided here too, in the same call (E14): every pass-2 part the learner reworked and every
 * pass-1 change they did not make unaided are offered, and the model says what each teaches and whether that is a
 * reusable expression they lacked. Pass 1 holds many of them (*furious about*, *tiene sentido*, *keep it up*), and some
 * pass-2 parts teach none (one of the writer's own alternatives picked). Code then refuses a phrase made only of words
 * the learner already wrote there (*overcast*); told so in the prompt, the model cut chunks down to single new words.
 */
const NotesSchema = z.object({
	notes: z.array(
		z.object({
			n: z.number(),
			lesson: z.string(),
			file: z.boolean(),
			phrase: z.string().nullable().optional(),
			ended: z.string().nullable().optional(),
			meaning: z.string().nullable().optional(),
			usage: z.string().nullable().optional(),
			examples: z
				.array(z.object({ t: z.string(), n: z.string() }))
				.nullable()
				.optional(),
		}),
	),
});
/** One part that changed: the stretch as first written and as it ended, and the change itself (`before` → `after`). */
export type NoteItem = { orig: string; final: string; before: string; after: string; problem: string; why: string[]; how: "rebuilt" | "corrected" };
const letters = (t: string) => t.toLowerCase().match(/\p{L}+/gu) ?? [];
/** Whether a phrase has none of the words the change brought in, so the learner had all of it already. */
export function alreadyTheirs(phrase: string, before: string, after: string) {
	const had = new Set(letters(before));
	const brought = letters(after).filter((w) => !had.has(w));
	return !letters(phrase).some((w) => brought.includes(w));
}
export async function notesFor(d: Draft, items: NoteItem[], ai: Caller): Promise<(NoteBody | null)[]> {
	if (!items.length) return [];
	const F = fbName(d);
	const T = LANG_NAMES[d.target];
	const user = [
		`${cap(aLearner(d))} of ${T} (own language ${LANG_NAMES[d.learner]}) just revised a piece for ${d.scene.platform}. These are the parts that changed:`,
		...items.map(
			(x, i) =>
				`${i + 1}. They first wrote: "${x.orig}"\n   It ended as: "${x.final}"\n   What was wrong: ${x.problem}\n   How: ${x.how === "rebuilt" ? "they rebuilt this part with the tutor" : "the tutor corrected it"}${x.why.length ? `\n   The tutor's notes on the new wording: ${x.why.join(" / ")}` : ""}`,
		),
		"",
		`Their notebook keeps ${T} expressions to review later. For each part, first lesson: what the change teaches, in a few English words. Then file: whether it earns an entry. An entry is worth filing only when the change teaches a reusable ${T} expression this writer did not have: a word in the sense meant here, which verb, preposition or adjective goes with which word, a set phrase or formula, the way this community says something. Not worth filing: a grammar rule applied (agreement, tense, mood, articles, gender, word order, a missing verb), spelling, accents, punctuation and capitals, a fact or a name put right, one of the writer's own alternatives picked, and words a writer at their level already uses (judge their level from what the draft already gets right).`,
		"One entry per expression: when two parts teach the same one, file it with the first and not again.",
		"For a part you file, write the entry:",
		`- phrase: the expression the change taught: the words that do the job the change was about, not the sentence's frame around them; as a learner would file it, in the form a phrasebook lists it ("topped with", "it's not anyone's fault"), at most six words, "…" only where a slot really varies; no letters such as X or Y, no translation, no grammar terms.`,
		`- meaning: in ${F}, one short line: what it means or does, in the sense it has here.`,
		`- usage: in ${F}, one or two short sentences: when people use it and what it goes with (register when it matters), and what makes it better than what they first wrote when that is the point.`,
		`- examples: three short, natural ${T} sentences using it in exactly the sense it has here (if it has other senses, as "our own" means both "made by us" and "belonging to us", never those), each with its ${F} translation (n): one in a situation like theirs (not their own sentence again), two in everyday situations far from it, built differently around it so they see how it is used, not one frame. Names of people, characters, places and groups stay exactly as the piece writes them, in the translations too (never a translated or transliterated name).`,
		"- ended: how it ended, copied exactly, with the expression as used there marked by a tag (<m>…</m>). In each example's t, mark the expression the same way.",
		"Marking shows where the expression is in a sentence: the words of that sentence that are the expression, as they are inflected there, and not words that only fill a slot in it; when other words come between its parts, each part is marked on its own.",
		"For a part you do not file, give only n, lesson and file.",
		pinLang(d),
		'Reply with JSON only: {"notes":[{"n":1,"lesson":"","file":true,"phrase":"","ended":"","meaning":"","usage":"","examples":[{"t":"","n":""}]},{"n":2,"lesson":"","file":false}]}',
	].join("\n");
	const r = (await chatJson([{ role: "user", content: user }], NotesSchema, { ai, effort: "low", tag: "session/notes" })).value.notes;
	return items.map((x, i) => {
		const y = r.find((z) => z.n === i + 1);
		// Where the expression is in their sentence, if the model marked words that are there (the copy may be shortened).
		const span = unmark(y?.ended ?? "").span;
		const marked = span && around(x.final, span) ? span : undefined;
		if (!y?.file || !y.phrase || !y.meaning || alreadyTheirs(marked ?? y.phrase, x.before, x.after)) return null;
		const examples = (y.examples ?? []).slice(0, 3).map((e) => {
			const m = unmark(e.t);
			return { t: m.text, n: e.n, ...(m.span ? { span: m.span } : {}) };
		});
		return { phrase: y.phrase, meaning: y.meaning, usage: y.usage ?? "", ...(marked ? { marked } : {}), examples };
	});
}

/**
 * The brief on what the writer imported (a whole work and its comments, a thread, any pasted text), made once per
 * session for this draft. Finding, rewriting and grading read the brief, not the import: the whole import pulled them
 * towards copy-editing and towards correcting the writer against the source (E9). It carries what they need to
 * understand the draft (what happens or what is said, what the draft refers to and answers, how people write there),
 * longer for a longer import.
 */
export async function briefFor(draft: string, note: string | undefined, source: string, ai: Caller) {
	const size = words(source).length;
	const limit = Math.max(350, Math.min(900, Math.round(size / 20 / 50) * 50));
	const user = [
		"A language learner imported this material as context for something they are writing. It is reference material, not their writing.",
		"<<<",
		source,
		">>>",
		"",
		note ? `Their note: ${note}\n` : "",
		"Their draft:",
		"<<<",
		draft,
		">>>",
		"",
		`Write a brief for the tutors who will help them revise the draft, so they understand what the draft is about. They will not see the material, only your brief. In English, at most ${limit} words, plain notes under these headings:`,
		"- What it is: the work, post or conversation (title, author, kind) and where the draft will appear. The material may be pasted text with no labels: work out what it is and who says what from the text itself.",
		"- What happens: for a story, the plot in order, enough to follow anything the draft says about it (who the people are and how they relate, the turning points, how it ends); for a discussion, what each side says, in order.",
		// Quoting the source's exact words beside the draft's led the analysis to correct a phrase the writer quoted loosely
		// from memory ("captain's integrity", E11): where it comes from is what the tutors need.
		"- What the draft refers to: each thing the draft quotes, paraphrases or points at: where it comes from (the work, the author's notes, or a comment and whose) and what happens or is said there, in your own words.",
		'- Replying to: if the draft answers one particular message (the note or the draft shows which), that message\'s author and its full text, verbatim. Else "none".',
		"- How people write here: concretely, how the people in this material write (capitalisation, punctuation, spelling, slang, emoji, length, how formal), in one or two sentences.",
		"Only facts from the material. Do not judge or correct the draft.",
	]
		.filter((l) => l !== "")
		.join("\n");
	return (await chat([{ role: "user", content: user }], { ai, effort: "low", tag: "session/brief" })).text.trim();
}
