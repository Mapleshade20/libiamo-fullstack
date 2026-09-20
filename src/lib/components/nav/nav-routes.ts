import type { Component } from "svelte";
import type { NavbarTransitionDirection } from "$lib/client/page-transition";
import BoxIcon from "./icons/BoxIcon.svelte";
import CardsIcon from "./icons/CardsIcon.svelte";
import ClinkIcon from "./icons/ClinkIcon.svelte";
import PeopleIcon from "./icons/PeopleIcon.svelte";
import PullRequestIcon from "./icons/PullRequestIcon.svelte";

type NavRouteCommon = {
	href: string;
	label: string;
	/** A deterministic tilt in degrees, so the row looks pasted rather than typeset. */
	tilt: number;
	exact?: boolean;
	sectionPaths?: string[];
	transitionDirection?: NavbarTransitionDirection;
};

/** Four routes are drawn stickers; the account is the learner's own face, cut out the same way. */
export type NavRoute =
	| (NavRouteCommon & { Icon: Component<{ playing?: boolean; active?: boolean }>; avatarUrl?: undefined })
	| (NavRouteCommon & { Icon?: undefined; avatarUrl: string });

/**
 * The routes, in one order shared by the wide top bar and the narrow bottom bar.
 *
 * Quest Hall sits first because it is the root the glasses stand for; the fourth slot is Contribute
 * for a learner and Admin for an administrator, never both. The account closes the row as an equal
 * of the other four — it is a page like any of them, and it slides in and out like one.
 */
export function appNavRoutes(base: string, role: string, avatarUrl?: string): NavRoute[] {
	const routes: NavRoute[] = [
		{ href: `${base}/`, label: "Quest Hall", Icon: ClinkIcon, tilt: -2, exact: true, sectionPaths: [`${base}/task`, `${base}/translate`] },
		{ href: `${base}/review`, label: "Review", Icon: CardsIcon, tilt: 1.5 },
		{ href: `${base}/archive`, label: "Archive", Icon: BoxIcon, tilt: -1 },
		role === "admin"
			? { href: `${base}/admin/templates`, label: "Admin", Icon: PeopleIcon, tilt: 2, sectionPaths: [`${base}/admin`] }
			: { href: `${base}/contribute`, label: "Contribute", Icon: PullRequestIcon, tilt: 2 },
	];
	if (avatarUrl) routes.push({ href: `${base}/profile`, label: "Profile", avatarUrl, tilt: -1.5 });
	return routes;
}

export function activeNavIndex(routes: Pick<NavRouteCommon, "href" | "exact" | "sectionPaths">[], pathname: string): number {
	return routes.findIndex((route) => {
		if (route.sectionPaths?.some((path) => pathname === path || pathname.startsWith(`${path}/`))) return true;
		return pathname === route.href || (!route.exact && pathname.startsWith(`${route.href}/`));
	});
}
