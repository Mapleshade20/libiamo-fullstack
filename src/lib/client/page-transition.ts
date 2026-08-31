import { base } from "$app/paths";

export type PageTransitionKind = "none" | "fade" | "section-fade" | "navbar-forward" | "navbar-backward";
export type NavbarTransitionDirection = "forward" | "backward";

const NAVBAR_INTENT_TTL_MS = 1_500;

interface NavbarTransitionIntent {
	destination: string;
	direction: NavbarTransitionDirection;
	createdAt: number;
}

let navbarTransitionIntent: NavbarTransitionIntent | null = null;

function destinationKey(url: URL) {
	return `${url.pathname}${url.search}${url.hash}`;
}

function stableSection(pathname: string) {
	if (pathname === `${base}/review` || pathname === `${base}/review/manage`) return "review";
	return null;
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

	if (intent && now >= intent.createdAt && now - intent.createdAt <= NAVBAR_INTENT_TTL_MS && intent.destination === destinationKey(destination)) {
		return intent.direction === "forward" ? "navbar-forward" : "navbar-backward";
	}

	if (from?.pathname === destination.pathname) return "none";

	const fromSection = from ? stableSection(from.pathname) : null;
	if (fromSection && fromSection === stableSection(destination.pathname)) return "section-fade";

	return "fade";
}
