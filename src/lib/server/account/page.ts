import type { RequestEvent } from "@sveltejs/kit";
import { BACKDROPS, type Backdrop, isAppLang, THEMES, type Theme } from "#lib/constants.ts";
import { appLangOf } from "#lib/i18n/langs.ts";

/** The cookie keeping the language the signed-out pages were switched to, and the one keeping the sidebar folded. */
export const LANG_COOKIE = "lang";
export const SIDE_COOKIE = "side";

export type PageSetup = {
	/** What the interface speaks: the language worked in, or before setting up the one picked or the browser's. */
	lang: string;
	/** The language the signed-out pages and the welcome start in. */
	firstLang: ReturnType<typeof appLangOf>;
	theme: Theme;
	backdrop: Backdrop;
	/** The sidebar folded to its stickers (this device's). */
	folded: boolean;
};

/** How a page is set up before it renders, from the learner's settings or (signed out) the browser and its cookies. */
export function pageSetup(event: Pick<RequestEvent, "locals" | "cookies" | "request">): PageSetup {
	const u = event.locals.user;
	const picked = event.cookies.get(LANG_COOKIE);
	const firstLang = isAppLang(picked)
		? picked
		: appLangOf(
				(event.request.headers.get("accept-language") ?? "")
					.split(",")
					.map((x) => x.split(";")[0])
					.filter(Boolean),
			);
	const theme = THEMES.find((t) => t === u?.theme) ?? "system";
	return {
		lang: u?.onboardedAt && u.activeLanguage ? u.activeLanguage : firstLang,
		firstLang,
		theme,
		backdrop: BACKDROPS.find((b) => b === u?.backdrop) ?? "none",
		folded: event.cookies.get(SIDE_COOKIE) === "folded",
	};
}
