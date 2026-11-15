import type { AppLang, Backdrop, Detail, PatternName, Theme, TutorLanguage } from "#lib/constants.ts";

export type Via = "email" | "google" | "github";

/** The signed-in account as the pages see it (lib/account/account.remote.ts builds it). */
export type Me = {
	email: string;
	name: string;
	/** Gravatar's picture for the address, if it has one. */
	picture: string | null;
	verified: boolean;
	/** How the account was made. */
	via: Via;
	/** A provider's account has no password until a mailed link sets one. */
	hasPassword: boolean;
	/** Google or GitHub accounts it signs in with, and since when (ISO). */
	linked: { id: string; provider: string; since: string }[];
	/** A new address waiting for its link; the old one signs in until then. */
	pendingEmail?: string;
	/** The learner's own key's setup (never the key itself); null until they add one. */
	key: { provider: string; model: string; decision: string | null } | null;
	role: "learner" | "admin";
	/** Whether the welcome is done; until then there are no settings. */
	onboarded: boolean;
	look: { theme: Theme; backdrop: Backdrop; pattern: PatternName; detail: Detail };
	prefs: { native: AppLang; learning: string[]; active: string; feedback: TutorLanguage; weeklyGoal: number; helpImprove: boolean } | null;
};
