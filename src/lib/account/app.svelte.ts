import type { AppLang, Backdrop, Detail, PatternName, Theme, TutorLanguage } from "#lib/constants.ts";
import { learnerState } from "#lib/scope.ts";
import { saveLook, savePrefs } from "./account.remote.ts";

/*
 * The learner's settings as the pages read them: their languages, the tutor's, the weekly aim, and how the pages look.
 * The server keeps them (lib/account/account.remote.ts); the root layout's load pours them in (account.svelte.ts), and
 * `save()` / `saveLook()` send a change back. Before the welcome is done they are the welcome's defaults.
 */
export type Prefs = {
	native: AppLang;
	learning: string[];
	/** The language being worked in: the interface speaks it. */
	active: string;
	/** The tutor's language inside a revision: the learner's own, or the one they write in. */
	feedback: TutorLanguage;
	weeklyGoal: number;
	name: string;
	helpImprove: boolean;
};
export type Look = { theme: Theme; backdrop: Backdrop; pattern: PatternName; detail: Detail };

/** A new account's settings, for someone whose own language is `native`: learning English (or Spanish, for English). */
export const firstPrefs = (native: AppLang): Prefs => {
	const learning = native === "en" ? "es" : "en";
	return { native, learning: [learning], active: learning, feedback: "native", weeklyGoal: 3, name: "", helpImprove: true };
};
export const FIRST_LOOK: Look = { theme: "system", backdrop: "none", pattern: "blossom", detail: "needed" };

class AppState {
	prefs = $state<Prefs>(firstPrefs("en"));
	look = $state<Look>({ ...FIRST_LOOK });
	/** Whether the system is dark (followed in the browser; the server cannot know). */
	systemDark = $state(false);
	get dark() {
		return this.look.theme === "dark" || (this.look.theme === "system" && this.systemDark);
	}
	/** The interface language. */
	get lang() {
		return this.prefs.active;
	}
	/** The tutor's language. */
	get tutor() {
		return this.prefs.feedback === "native" ? this.prefs.native : this.prefs.active;
	}
	/** Whether the account is set up: until the welcome is done its settings stay on the page. */
	onboarded = $state(false);
	/** Changes go to the server one after another, so an older one never lands after a newer one. */
	private queue: Promise<unknown> = Promise.resolve();
	private send(write: () => Promise<unknown>): Promise<boolean> {
		const sent = this.queue.then(write).then(
			() => true,
			(e) => notSaved(e).then(() => false),
		);
		this.queue = sent;
		return sent;
	}
	/**
	 * Sends the settings to the server (as they are when their turn comes); whether they were kept. When they were not,
	 * the learner is told and the page goes back to what the server holds.
	 */
	save(): Promise<boolean> {
		if (!this.onboarded) return Promise.resolve(true);
		return this.send(() => {
			const p = this.prefs;
			return savePrefs({
				name: p.name,
				native: p.native,
				learning: p.learning as never,
				active: p.active as never,
				feedback: p.feedback,
				weeklyGoal: p.weeklyGoal,
				helpImprove: p.helpImprove,
			});
		});
	}
	/** Changes how the pages look, and sends it to the server; whether it was kept. */
	saveLook(change: Partial<Look>): Promise<boolean> {
		Object.assign(this.look, change);
		return this.send(() => saveLook(change));
	}
}

/** A change the server did not keep: said so, and the page shows what it holds again. */
async function notSaved(e: unknown) {
	console.error("settings were not saved", e);
	// Imported here: these modules read the settings themselves.
	const [{ toast }, { tx }, { hydrate }] = await Promise.all([
		import("#lib/components/shell/toast.svelte.ts"),
		import("#lib/i18n/tx.ts"),
		import("./account.svelte.ts"),
	]);
	toast(tx("setNotSaved"));
	await hydrate().catch((err) => console.error("the account was not loaded again", err));
}
export const app = learnerState(() => new AppState());
