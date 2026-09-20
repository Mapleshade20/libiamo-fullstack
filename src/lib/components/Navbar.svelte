<script lang="ts">
import Menu from "@lucide/svelte/icons/menu";
import X from "@lucide/svelte/icons/x";
import { slide } from "svelte/transition";
import { base } from "$app/paths";
import { page } from "$app/state";
import { type NavbarTransitionDirection, setNavbarTransitionIntent } from "$lib/client/page-transition";
import NavIconRail from "./nav/NavIconRail.svelte";
import { activeNavIndex, appNavRoutes, type NavRoute } from "./nav/nav-routes";

interface NavItem {
	href: string;
	label: string;
	exact?: boolean;
	transitionDirection?: NavbarTransitionDirection;
}

interface Props {
	mode: "app" | "admin";
	user: { id?: string; name: string; email: string; role: string; activeLanguage: string };
	avatarUrl?: string;
	pendingReviewCount?: number;
}

let { mode, user, avatarUrl, pendingReviewCount = 0 }: Props = $props();

// --- App routes, drawn as clippings and shared by the top and bottom bars ---
const routes = $derived(appNavRoutes(base, user.role, avatarUrl));
const routeIndex = $derived(activeNavIndex(routes, page.url.pathname));

// --- Admin routes, still typeset ---
const adminItems: NavItem[] = [
	{ href: `${base}/admin/templates`, label: "Templates" },
	{ href: `${base}/admin/schedule`, label: "Schedule" },
	{ href: `${base}/admin/reviews`, label: "Reviews" },
	{ href: `${base}/`, label: "← App", exact: true, transitionDirection: "backward" },
];

const adminIndex = $derived(adminItems.findIndex((item) => (item.exact ? page.url.pathname === item.href : page.url.pathname.startsWith(item.href))));

// --- Sliding underline (admin only) ---
let navContainer: HTMLElement | undefined = $state();
let linkEls: HTMLElement[] = $state([]);
let hoveredIndex: number | null = $state(null);
let underlineLeft = $state(0);
let underlineWidth = $state(0);
let underlineReady = $state(false);

let displayIndex = $derived(hoveredIndex ?? adminIndex);

function measure() {
	const idx = displayIndex;
	if (idx >= 0 && idx < linkEls.length && linkEls[idx] && navContainer) {
		const containerRect = navContainer.getBoundingClientRect();
		const elRect = linkEls[idx].getBoundingClientRect();
		underlineLeft = elRect.left - containerRect.left;
		underlineWidth = elRect.width;
		underlineReady = true;
	}
}

$effect(() => {
	void displayIndex;
	measure();
});

$effect(() => {
	if (!navContainer) return;
	const ro = new ResizeObserver(() => measure());
	ro.observe(navContainer);
	return () => ro.disconnect();
});

function clickOutside(node: HTMLElement, params: { onClose: () => void; exclude: (HTMLElement | undefined)[] }) {
	let handler: ((e: MouseEvent) => void) | null = null;
	// Defer so the click that opened this dropdown doesn't immediately close it
	const timer = setTimeout(() => {
		handler = (event: MouseEvent) => {
			const target = event.target as Node;
			if (node.contains(target)) return;
			for (const el of params.exclude) {
				if (el?.contains(target)) return;
			}
			params.onClose();
		};
		document.addEventListener("click", handler);
	}, 0);
	return {
		destroy() {
			clearTimeout(timer);
			if (handler) document.removeEventListener("click", handler);
		},
	};
}

// --- Mobile menu (admin only) ---
let mobileOpen = $state(false);
let mobileButton: HTMLButtonElement | undefined = $state();

function prepareTransition(
	href: string,
	direction: NavbarTransitionDirection | undefined,
	targetIndex: number,
	currentIndex: number,
	event: MouseEvent,
) {
	if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
	if (currentIndex < 0 || targetIndex === currentIndex) return;
	setNavbarTransitionIntent(new URL(href, page.url), direction ?? (targetIndex > currentIndex ? "forward" : "backward"));
}

function onRouteClick(route: NavRoute, index: number, event: MouseEvent) {
	prepareTransition(route.href, route.transitionDirection, index, routeIndex, event);
}
</script>

{#if mode === "app"}
	<header
		class="app-notch fixed top-0 left-1/2 z-50 hidden h-14 -translate-x-1/2 items-center rounded-b-[0.875rem] border border-t-0 border-border bg-stone-50/50 px-6 backdrop-blur-xl nav:flex"
		data-app-nav
		style="view-transition-name: main-nav; --nav-icon-pad: 0.55rem; --nav-icon-reach: 0.1rem"
	>
		<NavIconRail {routes} activeIndex={routeIndex} onNavigate={onRouteClick} ariaLabel="Sections" />
	</header>
	<div id="hall-nav-inbox" class="fixed top-4 nav:top-[4.25rem] left-1/2 z-50 -translate-x-1/2 empty:hidden"></div>
{:else}
	<header
		class="fixed top-0 w-full z-50 bg-stone-50/80 backdrop-blur-xl shadow-sm shadow-stone-900/5 border-b border-border"
		data-app-nav
		style="view-transition-name: main-nav"
	>
		<div class="relative mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
			<!-- Left: Logo -->
			<a href="{base}/" class="flex items-center gap-2">
				<span class="wordmark text-foreground">Libiamo</span>
				{#if mode === "admin"}
					<span class="ml-1 rounded bg-foreground/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
						>Admin</span
					>
				{/if}
			</a>

			<!-- Admin keeps its typeset nav with the sliding underline. -->
			<nav bind:this={navContainer} class="relative hidden md:flex items-center gap-8 text-xs tracking-widest uppercase font-sans">
				{#each adminItems as item, i}
					<a
						bind:this={linkEls[i]}
						href={item.href}
						class="py-1 transition-colors duration-200 {i === adminIndex ? 'text-foreground font-bold' : 'text-muted-foreground hover:text-foreground'}"
						onclick={(event) => prepareTransition(item.href, item.transitionDirection, i, adminIndex, event)}
						onmouseenter={() => (hoveredIndex = i)}
						onmouseleave={() => (hoveredIndex = null)}
					>
						{item.label}
						{#if item.label === "Reviews" && pendingReviewCount > 0}
							<span class="ml-1 rounded-full bg-red-500 text-white text-[9px] px-1.5 py-0.5 leading-none font-bold">{pendingReviewCount}</span>
						{/if}
					</a>
				{/each}

				{#if underlineReady}
					<span
						class="pointer-events-none absolute -bottom-3 h-[2px] rounded-full bg-foreground"
						style="left: {underlineLeft}px; width: {underlineWidth}px; transition: left 350ms cubic-bezier(0.4, 0, 0.15, 1), width 350ms cubic-bezier(0.4, 0, 0.15, 1);"
					></span>
				{/if}
			</nav>

			<!-- Right section -->
			<div class="flex items-center gap-3">
				<button
					type="button"
					bind:this={mobileButton}
					class="md:hidden flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
					onclick={() => (mobileOpen = !mobileOpen)}
					aria-expanded={mobileOpen}
					aria-label="Toggle menu"
				>
					{#if mobileOpen}
						<X size={20} />
					{:else}
						<Menu size={20} />
					{/if}
				</button>
			</div>
		</div>

		{#if mode === "admin" && mobileOpen}
			<div
				class="md:hidden border-t border-border bg-stone-50/95 backdrop-blur-xl"
				transition:slide={{ duration: 200 }}
				use:clickOutside={{ onClose: () => { mobileOpen = false; }, exclude: [mobileButton] }}
			>
				<nav class="mx-auto max-w-5xl px-6 py-3 flex flex-col gap-1">
					{#each adminItems as item, i}
						<a
							href={item.href}
							onclick={(event) => {
							prepareTransition(item.href, item.transitionDirection, i, adminIndex, event);
							mobileOpen = false;
						}}
							class="rounded-md px-3 py-2.5 text-sm font-medium tracking-wide uppercase transition-colors {i === adminIndex
							? 'text-foreground bg-foreground/5 font-bold'
							: 'text-muted-foreground hover:text-foreground hover:bg-foreground/[0.03]'}"
						>
							{item.label}
							{#if item.label === "Reviews" && pendingReviewCount > 0}
								<span class="ml-2 rounded-full bg-red-500 text-white text-[9px] px-1.5 py-0.5 leading-none font-bold">{pendingReviewCount}</span>
							{/if}
						</a>
					{/each}
				</nav>
			</div>
		{/if}
	</header>
{/if}

{#if mode === "app"}
	<!-- Bottom bar, narrow only: the same clippings, larger, with the account at the end. -->
	<div
		class="fixed inset-x-0 bottom-0 z-50 flex h-[var(--app-bottom-nav-height)] items-center border-t border-border bg-stone-50/50 px-2 pt-1.5 backdrop-blur-xl nav:hidden"
		style="view-transition-name: main-nav; padding-bottom: max(0.5rem, env(safe-area-inset-bottom)); --nav-icon-size: 1.9rem; --nav-icon-pad: 0.5rem; --nav-icon-reach: 0.3rem"
	>
		<NavIconRail {routes} activeIndex={routeIndex} onNavigate={onRouteClick} ariaLabel="Sections" spread />
	</div>
{/if}
