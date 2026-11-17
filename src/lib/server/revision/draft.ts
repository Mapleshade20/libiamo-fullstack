/** The languages a learner can name as their own (the app's list); what they learn is one of LEARNABLE (lib/constants.ts). */
export const LANGS = ["en", "ru", "es", "de", "tr", "fa", "fr", "ja", "pt", "zh-CN", "vi", "it", "ar", "pl", "el", "nl", "id", "ko"] as const;
export type Lang = (typeof LANGS)[number];
/**
 * Chinese is Simplified Chinese as used in mainland China, and only that (no Traditional): the code says so, and so does
 * its name in every prompt, or models drift into Taiwan usage (猫战士 for the books mainland readers know as 猫武士).
 * Stored prefs and handoffs from before the rename still say "zh".
 */
export const normLang = <T>(l: T): T | "zh-CN" => (l === "zh" ? "zh-CN" : l);

export const LANG_NAMES: Record<Lang, string> = {
	en: "English",
	ru: "Russian",
	es: "Spanish",
	de: "German",
	tr: "Turkish",
	fa: "Persian",
	fr: "French",
	ja: "Japanese",
	pt: "Portuguese",
	"zh-CN": "Simplified Chinese (as used in mainland China)",
	vi: "Vietnamese",
	it: "Italian",
	ar: "Arabic",
	pl: "Polish",
	el: "Greek",
	nl: "Dutch",
	id: "Indonesian",
	ko: "Korean",
};

/** What the learner gives us, plus the scene C0 would infer (fixed here so experiments isolate one call). */
export type Draft = {
	id: string;
	title?: string;
	text: string;
	background?: string;
	/** What the writer imported as context, as one call condensed it for this draft (calls.ts `briefFor`). */
	brief?: string;
	/** The message the draft answers, when it is a reply (taken from the brief). */
	replyTo?: string;
	/** What the writer told the tutor about their post while revising (who a name is, what a line refers to). */
	told?: string[];
	target: Lang;
	/** The writer's own language: what their draft carries over, and the language of passages they could not yet say. */
	learner: Lang;
	/** The language everything for the writer is written in (the app's feedback language); defaults to `learner`. */
	feedback?: Lang;
	level: string;
	scene: { platform: string; audience: string; purpose: string };
};

/** The language writer-facing text is written in. */
/** "a B2 learner", "an Advanced (C1–C2) learner", or "a learner" when the level is not known (level ""). */
export const aLearner = (d: Pick<Draft, "level">) => (d.level ? `${/^[AEIOU]/i.test(d.level) ? "an" : "a"} ${d.level} learner` : "a learner");
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** The level as a line of context, or nothing when it is not known. */
export const levelLine = (d: Pick<Draft, "level">) => (d.level ? ` Level: ${d.level}.` : "");
export const fbName = (d: Pick<Draft, "learner" | "feedback">) => LANG_NAMES[d.feedback ?? d.learner];
/** Said wherever the writer's own words go into a prompt: they may write in any language, which must not change ours. */
export const pinLang = (d: Pick<Draft, "learner" | "feedback">) =>
	`The writer may write to you in any language; whatever they write in, everything you write for them is in ${fbName(d)}.`;

/**
 * The writer's note and the brief on what they imported, for every prompt that sees the scene. The brief explains; it
 * never becomes a standard the draft is corrected against.
 */
export function noteLines(d: Pick<Draft, "background" | "brief" | "told">): string[] {
	return [
		d.background ? `The writer's note about it, in their words: ${d.background}` : "",
		d.told?.length
			? `What the writer told the tutor about their post while revising (facts about their work and their meaning; take them as true):\n${d.told.map((x) => `- ${x}`).join("\n")}`
			: "",
		d.brief
			? `What the writer imported as context (a brief written from it). Use it to understand names, references, what is being answered and how people write there. Never use it to correct the writer's opinions, guesses or reading of the work, and never bring a line they quote from memory back to the source's wording.\n<<<\n${d.brief}\n>>>`
			: "",
	].filter(Boolean);
}

/** What a reader in the thread has in front of them besides the post: what it answers, and the work everyone there knows. */
export function readerFrame(d: Pick<Draft, "brief" | "replyTo">): string {
	return [
		d.replyTo ? `The post below is a reply. It answers this earlier message, which someone else wrote:\n<<<\n${d.replyTo}\n>>>` : "",
		d.brief ? "You know the work or the thread it is about as well as anyone there." : "",
	]
		.filter(Boolean)
		.join("\n");
}

/** The brief's "Replying to" section, unless it says none. */
export function replyIn(brief: string): string | undefined {
	const m = brief.match(/replying to\W*\s*([\s\S]*?)(?=\n\s*(?:[-*#]+\s*)*\**how people write here|$)/i);
	const body = m?.[1].replace(/^\W*\n/, "").trim();
	return body && !/^\W*none\b/i.test(body) ? body : undefined;
}
