import { type Draft, LANG_NAMES, levelLine, noteLines } from "../fixtures/types.ts";

/** The facts every pass-1 call sees, in one block. */
export function draftBlock(d: Draft): string {
	return [
		`Target language: ${LANG_NAMES[d.target]}. The writer's own language: ${LANG_NAMES[d.learner]}.${levelLine(d)}`,
		`Where it will be posted: ${d.scene.platform}.`,
		`Who will read it: ${d.scene.audience}.`,
		`What the writer wants to do: ${d.scene.purpose}.`,
		...noteLines(d),
		d.title ? `Title (context only, not part of the draft): ${d.title}` : "",
		"",
		"Draft:",
		"<<<",
		d.text,
		">>>",
	]
		.filter((l) => l !== "")
		.join("\n");
}

export const DRAFT_CONVENTIONS = (d: Draft) =>
	`The draft may contain passages in ${LANG_NAMES[d.learner]} where the writer could not say something in ${LANG_NAMES[d.target]}, and "a/b" slashes where they hesitated between options. Both are deliberate.`;

/**
 * What "taken another way" means, for every call that judges it (pass 1's routing and labels, pass 2's analysis, the
 * judge). Left vague ("readers would misunderstand"), the calls disagreed run to run and the judge read it as "can the
 * reader work the point out", dropping praise that reads as a complaint (E13, 2026-11-09; the user: a sting counts).
 */
export const MISREAD = `Words are taken another way than meant when a reader, reaching them, would come away with a different
- attitude or feeling: praise heard as a complaint, impatience or sarcasm; warmth as coldness; a joke as an insult; criticism heard as much harsher or milder than meant;
- act: a wish or hope heard as a demand, a question as a claim, news as a request, or the reverse;
- claim: who did what, what happened, what the writer thinks or knows (for example, that they misunderstood the work);
- strength: far stronger or weaker than meant (mild surprise heard as shock, a small doubt as rejection, liking as indifference).
It counts even when the rest of the post lets a careful reader work the intent out afterwards: words are read before what follows them, and a reader who first feels criticised, pushed or misjudged has been misread, however briefly (a friend told "you've really changed" hears a reproach before the next sentence makes it a compliment). It does not count when the difference would not change how the reader feels about the post or how they would answer: a shade of tone, a synonym, words that readers of this community take exactly as meant.`;

/**
 * Register: words read as meant that still do not suit who is talking to whom (the user, 2026-11-09: "you should
 * update faster" is fine from a boss, not from a reader to a fic's author). Measured by how common it is ("regulars
 * write it"), the judge let it through; it is judged from the seat of the one addressed.
 */
export const REGISTER = `Words are off in register when they are read as meant but do not suit who is speaking to whom here, by the writer's relationship to the readers and this community's manners: too demanding or pushy (a reader telling an author what to do or how fast to write; a student giving a professor a deadline), too blunt or curt, too familiar, or too stiff and formal for the place, or presuming what is not theirs to decide (unasked criticism, telling an author what their characters should do). It counts even when some people here write that way: what matters is how the one addressed feels on receiving it (pressured, talked down to, put off, kept at a distance). Casual style that this place expects is not off in register.`;

/** The routing rule shared by every strategy: 改对 vs 改好. */
export const ROUTING = `Every problem belongs to exactly one of two passes.

Pass 1 (fix now): the fix does not depend on anything the writer has not already made clear, and swaps a few words. Grammar, agreement, tense consistency, articles, prepositions, misspelt words; a single word that is wrong or carries the wrong connotation when the intended meaning is clear and the words as written cannot be taken another way (below); an "a/b" hesitation where only one reading fits; a slip in register (below) with one standard fix (a greeting or closing formula, a form of address).

Pass 2 (worked through with the writer): fixing it needs something only the writer can decide, or it is what the writer most needs to learn to say. Any passage left in the writer's own language or another language (they could not say it yet), and "a/b" alternatives whose readings differ and could all fit; a figure of speech, idiom or whole formula carried over word for word from the writer's language, which readers would take literally or not recognise ("we're going to have great meals" for a feast of new chapters, a letter's closing formula translated word by word), even when you can tell what it means: the writer should meet this community's own way of saying it (a short collocation with one standard fix, such as a calqued "make sense" or "have a good time", stays pass 1); a sentence whose point is unclear or left unstated (a missing conclusion, a gap in the reasoning); wording a reader could take another way than meant (below); wording off in register (below) where how to put it depends on what the writer wants (how direct to be, how to ask); problems of order and organisation. A pass-2 span is the smallest unit the writer's decision affects: for "a/b" alternatives, the alternatives; for an untranslated passage, the passage and any words that only make sense with it; for a point left unclear or unstated, the whole sentence, whose small errors are then solved in pass 2 too. Pass-1 problems outside a pass-2 span are still fixed in pass 1, even in the same sentence.

Leave alone whatever already reads naturally for this platform and these readers, including informal style, emoji and the writer's own voice. Do not polish what is fine.

${MISREAD}

${REGISTER}`;

/**
 * What is the writer's own and never corrected, and what is not voice however casual the post (user, 2026-10-24: a
 * language helper, not a nitpicker; keep the casualness, but never let carried-over wording through).
 */
export const VOICE = (d: Pick<Draft, "learner">) =>
	`The writer's voice stays: casual spelling and capitalisation (all lowercase, capitals for emphasis, keysmashes, stretched letters, a missing apostrophe in a contraction), slang, emoji and the community's own shorthand, wherever fluent members of this community write that way too; so does a greeting or a word from another language used as flavour that readers will get. Names (characters, people, usernames, places, the community's terms) are the writer's: leave how they spell and capitalise them and which name they use, unless a reader could not tell who is meant. None of these is a problem in either pass. But wording carried over from ${LANG_NAMES[d.learner]} (a calque, a collocation, structure or set phrase a fluent writer would not produce) is not voice: it is a problem however casual the post.`;
