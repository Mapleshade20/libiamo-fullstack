import type { Theme } from "#lib/constants.ts";
import { app } from "./app.svelte.ts";

/*
 * Light or dark: the server puts the learner's theme on <html> and app.html decides "system" before the first paint;
 * here the browser follows the system after, and a change of theme.
 */
const paint = () => {
	document.documentElement.dataset.theme = app.dark ? "dark" : "light";
};
/** Follows the system's light and dark (the root layout, once). */
export function followSystem() {
	const q = matchMedia("(prefers-color-scheme: dark)");
	const follow = () => {
		app.systemDark = q.matches;
		paint();
	};
	follow();
	q.addEventListener("change", follow);
}
export function setTheme(theme: Theme) {
	app.saveLook({ theme });
	paint();
}
