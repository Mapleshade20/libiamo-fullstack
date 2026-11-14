/** The interface languages (the main app's). */
export const APP_LANGS = ["en", "ru", "es", "de", "tr", "fa", "fr", "ja", "pt", "zh-CN", "vi", "it", "ar", "pl", "el", "nl", "id", "ko"] as const;
export type AppLang = (typeof APP_LANGS)[number];
/* What can be learnt here: the languages the models write and judge well. Scenarios are written by hand, so only some of
   them have any; the others get the whole tutor and notebook. */
export const LEARNABLE = ["en", "es", "fr", "de", "it", "pt", "ja", "ko", "zh-CN", "ru", "ar", "nl", "tr", "pl"] as const;
export const SCENARIO_LANGS = ["en", "es", "fr", "ja"] as const;
export const RTL_LANGS = ["ar", "fa"];

export const isAppLang = (l: unknown): l is AppLang => APP_LANGS.includes(l as AppLang);
export const hasScenarios = (l: string) => (SCENARIO_LANGS as readonly string[]).includes(l);

const cap1 = (s: string, l: string) => s.charAt(0).toLocaleUpperCase(l) + s.slice(1);
/** A language's name in another language ("zh-CN" is named by its script: 简体中文, Simplified Chinese). */
export function langName(code: string, inLang: string): string {
	try {
		return cap1(new Intl.DisplayNames([inLang], { type: "language" }).of(code === "zh-CN" ? "zh-Hans" : code) ?? code, inLang);
	} catch {
		return code;
	}
}
/** A language's own name for itself, as a switch lists them: a learner finds their language whatever the interface is in. */
export const endonym = (code: string) => langName(code, code);

/* Account values the database checks (src/lib/server/db/schema.ts). */
export const ROLES = ["learner", "admin"] as const;
export type Role = (typeof ROLES)[number];
/** The tutor speaks the learner's own language or the one they write in. */
export const TUTOR_LANGUAGES = ["native", "target"] as const;
export type TutorLanguage = (typeof TUTOR_LANGUAGES)[number];
/** Where a learner's own key comes from. */
export const KEY_PROVIDERS = ["openrouter", "deepseek", "openai", "glm"] as const;
export type KeyProvider = (typeof KEY_PROVIDERS)[number];

/* Pieces and their revision (src/lib/server/db/schema.ts). */
/** Where a piece came from: the learner's own writing, a scenario's exchange, a translation scenario. */
export const PIECE_KINDS = ["own", "scenario", "translation"] as const;
export type PieceKind = (typeof PIECE_KINDS)[number];
/** writing: a scenario still being played or a translation on its sheet; revising: inside the two passes. */
export const PIECE_STATES = ["writing", "revising", "finished", "set_aside"] as const;
export type PieceState = (typeof PIECE_STATES)[number];
/** How much the tutor brings up: what needs changing, or also what could be put better. */
export const DETAILS = ["needed", "more"] as const;
export type Detail = (typeof DETAILS)[number];
/** What the learner answered when asked whether they posted it. */
export const POSTED = ["yes", "not_yet", "no"] as const;
export type Posted = (typeof POSTED)[number];
/** How a model call ended: repaired is a reply that validated only after one repair; discarded, made ahead of need and never used. */
export const CALL_STATES = ["done", "failed", "repaired", "discarded"] as const;
export type CallState = (typeof CALL_STATES)[number];

/* The notebook and review (src/lib/server/db/schema.ts). */
/** Where an entry came from: the learner's own writing (a finished piece), or something they read and collected. */
export const NOTE_KINDS = ["own", "collected"] as const;
export type NoteKind = (typeof NOTE_KINDS)[number];
/** How a phrase sounds, as collecting names it. */
export const REGISTERS = ["neutral", "casual", "formal", "slang", "literary", "technical"] as const;
export type Register = (typeof REGISTERS)[number];
/** What the code made of a typed review answer (lib/review/check.ts). */
export const VERDICTS = ["exact", "close", "other", "miss", "none"] as const;
export type Verdict = (typeof VERDICTS)[number];

/* Password bounds. The upper one keeps zxcvbn (superlinear in the length) quick; the field stops typing there. */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
