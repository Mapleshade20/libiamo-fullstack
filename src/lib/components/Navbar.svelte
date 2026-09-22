<script lang="ts">
import { base } from "$app/paths";
import { page } from "$app/state";
import { setNavbarTransitionIntent } from "$lib/client/page-transition";
import type { LanguageCode } from "$lib/constants";
import { t } from "$lib/i18n";
import NavIconRail from "./nav/NavIconRail.svelte";
import { activeNavIndex, appNavRoutes, type NavRoute } from "./nav/nav-routes";

interface Props {
	user: { role: string };
	avatarUrl?: string;
	lang: LanguageCode;
}

let { user, avatarUrl, lang }: Props = $props();
const routes = $derived(appNavRoutes(base, user.role, avatarUrl, lang));
const routeIndex = $derived(activeNavIndex(routes, page.url.pathname));

function onRouteClick(route: NavRoute, index: number, event: MouseEvent) {
	if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
	if (routeIndex < 0 || index === routeIndex) return;
	setNavbarTransitionIntent(new URL(route.href, page.url), route.transitionDirection ?? (index > routeIndex ? "forward" : "backward"));
}
</script>

<header
	class="app-notch fixed top-0 left-1/2 z-50 hidden h-14 -translate-x-1/2 items-center rounded-b-[0.875rem] border border-t-0 border-border bg-stone-50/50 px-6 backdrop-blur-xl nav:flex"
	data-app-nav
	style="view-transition-name: main-nav; --nav-icon-pad: 0.55rem; --nav-icon-reach: 0.1rem"
>
	<NavIconRail {routes} activeIndex={routeIndex} onNavigate={onRouteClick} ariaLabel={t(lang, "nav.sections")} />
</header>
<div id="hall-nav-inbox" class="fixed top-4 nav:top-[4.25rem] left-1/2 z-50 -translate-x-1/2 empty:hidden"></div>

<!-- Bottom bar, narrow only: the same clippings, larger, with the account at the end. -->
<div
	class="fixed inset-x-0 bottom-0 z-50 flex h-[var(--app-bottom-nav-height)] items-center border-t border-border bg-stone-50/50 px-2 pt-1.5 backdrop-blur-xl nav:hidden"
	style="view-transition-name: main-nav; padding-bottom: max(0.5rem, env(safe-area-inset-bottom)); --nav-icon-size: 1.9rem; --nav-icon-pad: 0.5rem; --nav-icon-reach: 0.3rem"
>
	<NavIconRail
		{routes}
		activeIndex={routeIndex}
		onNavigate={onRouteClick}
		ariaLabel={t(lang, "nav.sections")}
		spread
		gap="clamp(0.75rem, 2.25vw, 1.5rem)"
	/>
</div>
