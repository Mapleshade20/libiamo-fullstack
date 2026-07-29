<script lang="ts">
import Menu from "@lucide/svelte/icons/menu";
import X from "@lucide/svelte/icons/x";
import { slide } from "svelte/transition";
import { enhance } from "$app/forms";
import { page } from "$app/state";
import { type NavbarTransitionDirection, setNavbarTransitionIntent } from "$lib/client/page-transition";
import { LANGUAGE_CODES, LANGUAGE_LABELS } from "$lib/constants";
import WineGlassIcon from "./WineGlassIcon.svelte";

interface NavItem {
	href: string;
	label: string;
	exact?: boolean;
	sectionPaths?: string[];
	transitionDirection?: NavbarTransitionDirection;
}

type TrialQuotaNavBalance = {
	trialTokensLeft: number;
	trialTokensTotal: number;
};

interface Props {
	mode: "app" | "admin";
	user: { name: string; email: string; role: string; activeLanguage: string };
	avatarUrl?: string;
	pendingReviewCount?: number;
	trialQuota?: TrialQuotaNavBalance | null;
}

let { mode, user, avatarUrl, pendingReviewCount = 0, trialQuota = null }: Props = $props();

// --- Nav items ---
const appItems: NavItem[] = $derived([
	{ href: "/review", label: "Review" },
	{ href: "/", label: "Quests", exact: true, sectionPaths: ["/task", "/translate"] },
	{ href: "/archive", label: "Archive" },
	...(user.role !== "admin" ? [{ href: "/contribute", label: "Contribute" }] : []),
	...(user.role === "admin" ? [{ href: "/admin/templates", label: "Admin" }] : []),
]);

const adminItems: NavItem[] = [
	{ href: "/admin/templates", label: "Templates" },
	{ href: "/admin/schedule", label: "Schedule" },
	{ href: "/admin/reviews", label: "Reviews" },
	{ href: "/", label: "\u2190 App", exact: true, transitionDirection: "backward" },
];

const navItems = $derived(mode === "app" ? appItems : adminItems);

// --- Active index ---
function matchIndex(items: NavItem[], pathname: string): number {
	return items.findIndex((item) => {
		if (item.sectionPaths?.some((path) => pathname === path || pathname.startsWith(`${path}/`))) return true;
		return item.exact ? pathname === item.href : pathname.startsWith(item.href);
	});
}

let activeIndex = $derived(matchIndex(navItems, page.url.pathname));

// --- Sliding underline ---
let navContainer: HTMLElement | undefined = $state();
let linkEls: HTMLElement[] = $state([]);
let hoveredIndex: number | null = $state(null);
let underlineLeft = $state(0);
let underlineWidth = $state(0);
let underlineReady = $state(false);

let displayIndex = $derived(hoveredIndex ?? activeIndex);

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

// --- Language switcher ---
const flagBaseUrl = "https://flagcdn.com/w40/";
const countryCodeMap: Record<string, string> = { en: "gb", ja: "jp" };

function getFlagCode(lang: string): string {
	return countryCodeMap[lang] ?? lang;
}

let langOpen = $state(false);
let langTrigger: HTMLButtonElement | undefined = $state();

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

// --- Mobile menu ---
let mobileOpen = $state(false);
let mobileButton: HTMLButtonElement | undefined = $state();

function closeMobile() {
	mobileOpen = false;
}

function prepareNavbarTransition(event: MouseEvent, item: NavItem, targetIndex: number) {
	if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
	if (activeIndex < 0 || targetIndex === activeIndex) return;

	const direction = item.transitionDirection ?? (targetIndex > activeIndex ? "forward" : "backward");
	setNavbarTransitionIntent(new URL(item.href, page.url), direction);
}

function quotaPercentage(balance: TrialQuotaNavBalance) {
	return Math.max(0, Math.min(100, Math.round((balance.trialTokensLeft / balance.trialTokensTotal) * 100)));
}

let quotaPercent = $derived(trialQuota ? quotaPercentage(trialQuota) : 0);
let quotaTone = $derived(!trialQuota ? "normal" : trialQuota.trialTokensLeft <= 0 ? "depleted" : quotaPercent <= 10 ? "low" : "normal");
</script>

<header
	class="fixed top-0 w-full z-50 bg-stone-50/80 backdrop-blur-xl shadow-sm shadow-stone-900/5 border-b border-border"
	data-app-nav
	style="view-transition-name: main-nav"
>
	<div class="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
		<!-- Left: Logo -->
		<a href="/" class="flex items-center gap-2">
			<WineGlassIcon />
			<span class="font-serif text-xl font-normal tracking-tight text-foreground">Libiamo</span>
			{#if mode === "admin"}
				<span class="ml-1 rounded bg-foreground/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
					>Admin</span
				>
			{/if}
		</a>

		<!-- Center: Desktop nav with sliding underline -->
		<nav bind:this={navContainer} class="relative hidden md:flex items-center gap-8 text-xs tracking-widest uppercase font-sans">
			{#each navItems as item, i}
				<a
					bind:this={linkEls[i]}
					href={item.href}
					class="py-1 transition-colors duration-200 {i === activeIndex
						? 'text-foreground font-bold'
						: 'text-muted-foreground hover:text-foreground'}"
					onclick={(event) => prepareNavbarTransition(event, item, i)}
					onmouseenter={() => (hoveredIndex = i)}
					onmouseleave={() => (hoveredIndex = null)}
				>
					{item.label}
					{#if item.label === "Reviews" && pendingReviewCount > 0}
						<span class="ml-1 rounded-full bg-red-500 text-white text-[9px] px-1.5 py-0.5 leading-none font-bold">{pendingReviewCount}</span>
					{/if}
				</a>
			{/each}

			<!-- Sliding underline indicator -->
			{#if underlineReady}
				<span
					class="pointer-events-none absolute -bottom-3 h-[2px] rounded-full bg-foreground"
					style="left: {underlineLeft}px; width: {underlineWidth}px; transition: left 350ms cubic-bezier(0.4, 0, 0.15, 1), width 350ms cubic-bezier(0.4, 0, 0.15, 1);"
				></span>
			{/if}
		</nav>

		<!-- Right section -->
		<div class="flex items-center gap-3">
			{#if mode === "app" && trialQuota}
				<a
					href="/profile"
					class="hidden sm:flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors {quotaTone === 'depleted'
						? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
						: quotaTone === 'low'
							? 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100'
							: 'border-border bg-background/70 text-muted-foreground hover:bg-secondary hover:text-foreground'}"
					title="Trial AI balance"
				>
					<span>Trial</span>
					<span class="tabular-nums">{quotaPercent}%</span>
				</a>
			{/if}

			<!-- Mobile hamburger -->
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

			{#if mode === "app"}
				<!-- Language switcher -->
				<div class="relative">
					<button
						type="button"
						bind:this={langTrigger}
						onclick={() => (langOpen = !langOpen)}
						class="flex items-center gap-2 rounded-md px-2 py-1 text-sm font-medium transition-colors hover:bg-secondary"
						aria-expanded={langOpen}
					>
						<img src={`${flagBaseUrl}${getFlagCode(user.activeLanguage)}.webp`} alt={user.activeLanguage} class="h-5 w-5 rounded-full object-cover">
						<span>{user.activeLanguage.toUpperCase()}</span>
					</button>

					{#if langOpen}
						<div
							class="absolute right-0 mt-2 w-32 overflow-hidden rounded-md border border-border bg-background shadow-lg z-50"
							use:clickOutside={{ onClose: () => { langOpen = false; }, exclude: [langTrigger] }}
						>
							<form
								method="POST"
								action="/?/switchLanguage"
								use:enhance={() => {
									return async ({ update }) => {
										langOpen = false;
										await update();
									};
								}}
							>
								<div class="py-1">
									{#each LANGUAGE_CODES as lang}
										<button
											type="submit"
											name="language"
											value={lang}
											class="flex w-full items-center gap-3 px-3 py-2 text-sm hover:bg-secondary transition-colors {user.activeLanguage === lang
												? 'bg-primary/10 text-primary font-semibold'
												: 'text-foreground'}"
										>
											<img src={`${flagBaseUrl}${getFlagCode(lang)}.webp`} alt={lang} class="h-4 w-4 rounded-sm object-cover">
											<span>{LANGUAGE_LABELS[lang]}</span>
										</button>
									{/each}
								</div>
							</form>
						</div>
					{/if}
				</div>

				<!-- Avatar -->
				{#if avatarUrl}
					<a href="/profile" class="flex items-center transition-opacity hover:opacity-80">
						<img src={avatarUrl} alt={user.name} class="h-8 w-8 rounded-full border border-border object-cover shadow-sm">
					</a>
				{/if}
			{/if}
		</div>
	</div>

	<!-- Mobile dropdown menu -->
	{#if mobileOpen}
		<div
			class="md:hidden border-t border-border bg-stone-50/95 backdrop-blur-xl"
			transition:slide={{ duration: 200 }}
			use:clickOutside={{ onClose: () => { mobileOpen = false; }, exclude: [mobileButton] }}
		>
			<nav class="mx-auto max-w-5xl px-6 py-3 flex flex-col gap-1">
				{#each navItems as item, i}
					<a
						href={item.href}
						onclick={(event) => {
							prepareNavbarTransition(event, item, i);
							closeMobile();
						}}
						class="rounded-md px-3 py-2.5 text-sm font-medium tracking-wide uppercase transition-colors {i === activeIndex
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
