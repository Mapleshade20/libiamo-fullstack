import { base } from "$app/paths";

/**
 * A navigation either sweeps sideways between the bar's own sections or it simply cuts. There is no
 * crossfade: two pages dissolving through each other read as one smeared page, not as two.
 */
export type PageTransitionKind = "none" | "navbar-forward" | "navbar-backward";
export type NavbarTransitionDirection = "forward" | "backward";

const NAVBAR_INTENT_TTL_MS = 1_500;

interface NavbarTransitionIntent {
	destination: string;
	direction: NavbarTransitionDirection;
	createdAt: number;
}

let navbarTransitionIntent: NavbarTransitionIntent | null = null;

export function isQuestMenuPath(pathname: string): boolean {
	if (pathname === `${base}/`) return true;
	if (!pathname.startsWith(`${base}/`)) return false;
	return /^task\/[1-9]\d*$/.test(pathname.slice(base.length + 1));
}

function destinationKey(url: URL) {
	return `${url.pathname}${url.search}${url.hash}`;
}

export function setNavbarTransitionIntent(destination: URL, direction: NavbarTransitionDirection, createdAt = Date.now()) {
	navbarTransitionIntent = {
		destination: destinationKey(destination),
		direction,
		createdAt,
	};
}

export function resolvePageTransition(from: URL | null, destination: URL, now = Date.now()): PageTransitionKind {
	const intent = navbarTransitionIntent;
	navbarTransitionIntent = null;

	// The persistent book owns these transitions, not document snapshots.
	if (from && isQuestMenuPath(from.pathname) && isQuestMenuPath(destination.pathname)) return "none";

	if (intent && now >= intent.createdAt && now - intent.createdAt <= NAVBAR_INTENT_TTL_MS && intent.destination === destinationKey(destination)) {
		return intent.direction === "forward" ? "navbar-forward" : "navbar-backward";
	}

	return "none";
}
