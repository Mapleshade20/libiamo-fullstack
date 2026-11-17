<script lang="ts">
import Check from "@lucide/svelte/icons/check";
import Compass from "@lucide/svelte/icons/compass";
import Globe from "@lucide/svelte/icons/globe";
import LogOut from "@lucide/svelte/icons/log-out";
import MessageSquareHeart from "@lucide/svelte/icons/message-square-heart";
import Settings from "@lucide/svelte/icons/settings";
import ShieldCheck from "@lucide/svelte/icons/shield-check";
import UserRound from "@lucide/svelte/icons/user-round";
import { tick } from "svelte";
import { account, signOut } from "#lib/account/account.svelte.ts";
import { app } from "#lib/account/app.svelte.ts";
import { switchLanguage } from "#lib/account/language.ts";
import { onboarding } from "#lib/account/onboarding.svelte.ts";
import FloatingPanel from "#lib/components/common/FloatingPanel.svelte";
import LanguageFlag from "#lib/components/common/LanguageFlag.svelte";
import { reducedMotion } from "#lib/components/common/motion.ts";
import AvatarSticker from "#lib/components/stickers/AvatarSticker.svelte";
import { createPlay } from "#lib/components/stickers/play.svelte.ts";
import Sticker from "#lib/components/stickers/Sticker.svelte";
import type { StickerName } from "#lib/components/stickers/stickers.ts";
import { hasScenarios } from "#lib/constants.ts";
import { endonym, tx } from "#lib/i18n/tx.ts";
import { dueNow } from "#lib/notebook/notebook.svelte.ts";
import { openPiece } from "#lib/writing/open.ts";
import { siteOf } from "#lib/writing/sites.ts";
import { shelfNow } from "#lib/writing/writing.svelte.ts";
import { afterNavigate, goto } from "$app/navigation";
import { page } from "$app/state";
import EmptyState from "./EmptyState.svelte";
import { shell } from "./shell.svelte";

/*
 * The app's bar: a desk edge with the stickers on it (the main app's navigation stickers). The page you are on has
 * one pen line under its words, ruled in when you arrive. Below, the latest pieces as postcards; at the foot the
 * account and the language being worked in. Folded, it is a rail of stickers that name themselves on hover; on a phone
 * it is a drawer over the page.
 */
const dueCount = $derived((await dueNow()).count);
const nav = $derived<{ id: string; href: string; sticker: StickerName | "clink"; label: string; count: number; tilt: number }[]>([
	{ id: "home", href: "/", sticker: "pen", label: tx("navNew"), count: 0, tilt: -2 },
	{ id: "library", href: "/library", sticker: "clink", label: tx("navLibrary"), count: 0, tilt: 2 },
	{ id: "notebook", href: "/notebook", sticker: "cards", label: tx("navNotebook"), count: dueCount, tilt: 1.5 },
	{ id: "writing", href: "/writing", sticker: "box", label: tx("navWriting"), count: shelfNow().open.length, tilt: -1 },
]);
// A scenario belongs to the prompts; a piece to my writing.
const current = $derived(
	nav.find((n) => n.href === page.url.pathname)?.id ??
		(page.url.pathname.startsWith("/scenario/") ? "library" : page.url.pathname.startsWith("/w/") ? "writing" : ""),
);
// What they are writing and have written (the shelf leaves abandoned pieces to My writing).
const recent = $derived(shelfNow().recent);
// The account's own pages: there its sticker stays "in hand", as a row's does on its page.
const mine = $derived(["/profile", "/settings", "/feedback"].includes(page.url.pathname));
const plays: Record<string, ReturnType<typeof createPlay>> = {
	home: createPlay(),
	library: createPlay(),
	notebook: createPlay(),
	writing: createPlay(),
};

let side: HTMLElement | undefined = $state();
let navEl: HTMLElement | undefined = $state();
let mark = $state<{ top: number; height: number; left: number; width: number } | null>(null);
// The card is put down by hand each time: a new small turn per page, -0.8° (anticlockwise) at most.
let turn = $state(-0.8);
let narrow = $state(false);

// The page you are on is the index card lying on top of the others: lifted, turned a degree, sliding from row to row as
// the learner moves.
function placeMark(redraw = false) {
	if (redraw) turn = Math.round((-0.8 + Math.random() * 1.4) * 100) / 100;
	const row = navEl?.querySelector<HTMLElement>("[aria-current='page']");
	mark = row ? { top: row.offsetTop, height: row.offsetHeight, left: row.offsetLeft, width: row.offsetWidth } : null;
}
// On a phone the drawer stays open while the card slides to the chosen row, with the page changing behind it, and
// closes as both settle (the card's slide and the page's entrance end at about the same time).
let closeTimer: ReturnType<typeof setTimeout> | undefined;
afterNavigate(async () => {
	clearTimeout(closeTimer);
	const open = shell.drawer && narrow;
	if (!open) shell.setDrawer(false);
	await tick();
	placeMark(true);
	if (open) closeTimer = setTimeout(() => shell.setDrawer(false), reducedMotion() ? 0 : 300);
});
$effect(() => () => clearTimeout(closeTimer));
$effect(() => {
	void app.lang;
	tick().then(() => placeMark());
});
$effect(() => {
	if (!side) return;
	const ro = new ResizeObserver(() => placeMark());
	ro.observe(side);
	const mq = matchMedia("(max-width: 899px)");
	const sync = () => {
		narrow = mq.matches;
		if (!mq.matches) shell.setDrawer(false);
	};
	sync();
	mq.addEventListener("change", sync);
	return () => {
		ro.disconnect();
		mq.removeEventListener("change", sync);
	};
});

function toggleFold() {
	hideTip();
	shell.setFolded(!shell.folded);
}

/* The folded rail names its stickers: delayed in (400ms), out at once, and at once from one sticker to the next. */
let tip = $state<{ text: string; top: number; left: number } | null>(null);
let tipTimer: ReturnType<typeof setTimeout> | undefined;
let tipShown = false;
function showTip(el: HTMLElement) {
	if (!shell.folded || narrow || !el.dataset.tip) return;
	clearTimeout(tipTimer);
	const go = () => {
		// A tip on a layout-less wrapper (display: contents) is placed by the control that holds it.
		const box = el.getBoundingClientRect().width ? el : (el.closest<HTMLElement>("button, a") ?? el);
		const r = box.getBoundingClientRect();
		tip = { text: el.dataset.tip as string, left: r.right + 10, top: r.top + r.height / 2 - 13 };
		tipShown = true;
	};
	if (tipShown) go();
	else tipTimer = setTimeout(go, 400);
}
function hideTip(soon = false) {
	clearTimeout(tipTimer);
	tip = null;
	if (!soon) tipShown = false;
	else tipTimer = setTimeout(() => (tipShown = false), 300);
}
const tipOf = (e: Event) => (e.target as HTMLElement).closest<HTMLElement>("[data-tip]");

let langOpen = $state(false);
let meOpen = $state(false);
const menuSide = $derived(shell.folded && !narrow ? "right" : "top");

function onNav(e: MouseEvent, id: string) {
	plays[id]?.play();
	// Only the row's own page stays put; from a page under it (a piece under My writing) the row goes back up.
	if (id === current && page.url.pathname === nav.find((n) => n.id === id)?.href) {
		e.preventDefault();
		shell.setDrawer(false);
		// "New writing" on the home page itself: back to the box.
		if (id === "home") document.getElementById("draft")?.focus();
	}
}
$effect(() => {
	if (!shell.drawer) return;
	tick().then(() => side?.querySelector<HTMLElement>(".nav-row")?.focus({ preventScroll: true }));
	const onKey = (e: KeyboardEvent) => {
		if (e.key === "Escape" && !langOpen && !meOpen) {
			shell.setDrawer(false);
			document.getElementById("menu-btn")?.focus();
		}
	};
	addEventListener("keydown", onKey);
	return () => removeEventListener("keydown", onKey);
});
/* The menu finishes closing (150 ms) before the page changes language, or its fading copy is caught in the switch. */
const MENU_CLOSE_MS = 160;
</script>

<div class="scrim" aria-hidden="true" onclick={() => shell.setDrawer(false)}></div>
<aside
	class="side"
	bind:this={side}
	aria-label="Libiamo"
	inert={narrow && !shell.drawer}
	onpointerover={(e) => {
		const t = tipOf(e);
		if (t) showTip(t);
	}}
	onpointerout={(e) => {
		if (tipOf(e) && !(e.relatedTarget as HTMLElement | null)?.closest?.("[data-tip]")) hideTip(true);
	}}
	onfocusin={(e) => {
		const t = tipOf(e);
		if (t?.matches(":focus-visible")) showTip(t);
	}}
	onfocusout={() => hideTip()}
>
	<div class="side-top">
		<a class="wordmark" href="/" tabindex={shell.folded && !narrow ? -1 : 0}>Libiamo</a>
		<button
			type="button"
			class="fold-btn"
			aria-expanded={!shell.folded}
			aria-label={tx(shell.folded ? "sideUnfold" : "sideFold")}
			data-tip={tx(shell.folded ? "sideUnfold" : "sideFold")}
			onclick={toggleFold}
		>
			<svg class="fold-mark" viewBox="0 0 20 20" aria-hidden="true"><path d="M12.4 4.6c-2.2 1.9-3.9 3.6-5.2 5.3 1.4 1.8 3 3.5 5.2 5.5" /></svg>
		</button>
	</div>
	<nav class="nav" bind:this={navEl} style:--sel-turn="{turn}deg" aria-label={tx("homeTitle")}>
		{#each nav as n (n.id)}
			<a
				class="nav-row"
				class:playing={plays[n.id].playing}
				href={n.href}
				aria-current={current === n.id ? "page" : undefined}
				data-tip={n.label}
				aria-label={n.count ? `${n.label} (${n.count})` : n.label}
				onclick={(e) => onNav(e, n.id)}
			>
				<Sticker name={n.sticker} tilt={n.tilt} playing={plays[n.id].playing} />
				<span class="words">{n.label}</span>
				{#if n.count}
					<span class="count" aria-hidden="true">{n.count}</span>
				{/if}
			</a>
		{/each}
		<span
			class="nav-sel"
			class:on={!!mark}
			style:top="{mark?.top ?? 0}px"
			style:height="{mark?.height ?? 0}px"
			style:left="{mark?.left ?? 0}px"
			style:width="{mark?.width ?? 0}px"
			aria-hidden="true"
		></span>
	</nav>
	<p class="side-section">{tx("sideRecent")}</p>
	<div class="recents">
		{#each recent as w, i (w.id)}
			{@const st = siteOf(w.site)}
			<a
				class="postcard"
				href="/w/{w.id}"
				onclick={(e) => {
					e.preventDefault();
					openPiece(w);
				}}
				title={w.title}
				style:--tone={st.tone}
				style:--deep={st.deep}
				style:--tilt="{[-4, 3, -2, 5, -3, 2][i % 6]}deg"
			>
				<span class="stamp-dot" aria-hidden="true"></span>
				<span class="words">{w.title}</span>
				{#if w.open}
					<span class="clip" title={tx("scenarioActive")}></span>
				{/if}
			</a>
		{:else}
			<EmptyState compact art="box" title={tx("sideNothing")} />
		{/each}
		{#if recent.length}
			<a class="view-all" href="/writing">{tx("sideAll")}</a>
		{/if}
	</div>
	<div class="side-foot">
		<FloatingPanel bind:open={meOpen} label={app.prefs.name} side={menuSide} align="start" role="menu" plainTrigger triggerClass="me" class="w-56">
			{#snippet trigger()}
				<span class="contents" data-tip={app.prefs.name} role="presentation">
					<AvatarSticker name={app.prefs.name} photo={account.me.picture ?? undefined} drawn={meOpen || mine} />
					<span class="words">{app.prefs.name}</span>
				</span>
			{/snippet}
			<a class="floating-menu-item" href="/profile" onclick={() => (meOpen = false)}
				><UserRound class="size-4 text-muted-foreground" aria-hidden="true" />{tx("navProfile")}</a
			>
			<a class="floating-menu-item" href="/settings" onclick={() => (meOpen = false)}
				><Settings class="size-4 text-muted-foreground" aria-hidden="true" />{tx("navSettings")}</a
			>
			<a class="floating-menu-item" href="/feedback" onclick={() => (meOpen = false)}
				><MessageSquareHeart class="size-4 text-muted-foreground" aria-hidden="true" />{tx("navFeedback")}</a
			>
			<!-- The tour again, whenever they like: it plays on the home page, on its own stand-ins (nothing of theirs is touched). -->
			<button
				type="button"
				class="floating-menu-item"
				onclick={() => {
					meOpen = false;
					onboarding.tour = true;
					if (page.url.pathname !== "/") goto("/");
				}}
			>
				<Compass class="size-4 text-muted-foreground" aria-hidden="true" />{tx("navTour")}
			</button>
			<!-- Staff only; the admin pages are in English. -->
			{#if account.me.role === "admin"}
				<a class="floating-menu-item" href="/admin" onclick={() => (meOpen = false)}
					><ShieldCheck class="size-4 text-muted-foreground" aria-hidden="true" />Admin</a
				>
			{/if}
			<div class="menu-sep"></div>
			<button
				type="button"
				class="floating-menu-item"
				onclick={() => {
					meOpen = false;
					signOut();
				}}
			>
				<LogOut class="size-4 text-muted-foreground" aria-hidden="true" />{tx("navSignOut")}
			</button>
		</FloatingPanel>
		<FloatingPanel
			bind:open={langOpen}
			label={`${tx("wsSwitch")}: ${endonym(app.lang)}`}
			side={menuSide}
			align="start"
			role="menu"
			plainTrigger
			triggerClass="chip-lang"
			class="w-64"
		>
			{#snippet trigger()}
				<span class="flag-in" data-tip={endonym(app.lang)}><LanguageFlag language={app.lang} /></span>
			{/snippet}
			{#each app.prefs.learning as l (l)}
				<button
					type="button"
					class="floating-menu-item"
					role="menuitemradio"
					aria-checked={l === app.lang}
					onclick={() => {
						langOpen = false;
						setTimeout(() => switchLanguage(l), MENU_CLOSE_MS);
					}}
				>
					<LanguageFlag language={l} size={20} />
					<span class="min-w-0 flex-1"
						>{endonym(l)}
						{#if !hasScenarios(l)}
							<span class="block text-xs text-muted-foreground">{tx("wsNoScenarios")}</span>
						{/if}</span
					>
					<Check class="size-4 shrink-0 {l === app.lang ? "" : "invisible"}" aria-hidden="true" />
				</button>
			{/each}
			<div class="menu-sep"></div>
			<a class="floating-menu-item" href="/settings#languages" onclick={() => (langOpen = false)}
				><Globe class="size-4 text-muted-foreground" aria-hidden="true" />{tx("wsManage")}</a
			>
		</FloatingPanel>
	</div>
</aside>
<!-- The rail's tips are the app's tip (layout.css .tip-pill), placed beside the rail. -->
{#if tip}
	<div class="tip-pill on" data-side="right" style:translate="{tip.left}px {tip.top}px" aria-hidden="true">{tip.text}</div>
{/if}

<style>
.side {
	position: fixed;
	inset: 0 auto 0 0;
	z-index: 50;
	width: var(--side);
	display: flex;
	flex-direction: column;
	padding: 12px 10px 10px;
	background: var(--side-bg);
	border-inline-end: 1px solid var(--line-soft);
	/* clip, not hidden: a folded bar must never scroll sideways when a row is focused or scrolled into view. */
	overflow: clip;
	transition: width 250ms var(--ease-panel);
	view-transition-name: side;
}
/* To and from a focused page (no sidebar there) the bar slides away and back as one solid piece, carrying its wordmark
   (layout.css); it never fades with the page. */
.side-top {
	display: flex;
	align-items: center;
	height: 44px;
	padding-inline-start: 8px;
	margin-bottom: 10px;
}
.side-top .wordmark {
	flex: 1;
	min-width: 0;
	transition: opacity 120ms ease-out;
}
.fold-btn {
	display: inline-grid;
	place-items: center;
	width: 36px;
	height: 36px;
	flex: none;
	border: 0;
	border-radius: 6px;
	background: transparent;
	color: var(--muted);
	cursor: pointer;
	transition:
		color 150ms,
		background-color 150ms,
		scale 150ms;
}
.fold-btn:hover {
	color: var(--ink);
	background: var(--hover);
}
/* A drawn chevron in the stickers' hand: points at the edge it folds to, turns round when folded. */
.fold-mark {
	width: 20px;
	height: 20px;
	fill: none;
	stroke: currentColor;
	stroke-width: 1.9;
	stroke-linecap: round;
	stroke-linejoin: round;
	transition: rotate 300ms var(--ease-panel);
}
:global(html.side-folded) .fold-mark {
	rotate: 180deg;
}
.fold-btn:active {
	scale: 0.97;
}
.nav {
	position: relative;
	display: grid;
	gap: 2px;
}
.nav-row {
	position: relative;
	display: flex;
	align-items: center;
	gap: 14px;
	height: 44px;
	padding: 0 10px;
	border-radius: 6px;
	color: var(--ink-2);
	font-size: 14.5px;
	text-decoration: none;
	white-space: nowrap;
	cursor: pointer;
	transition:
		background-color 150ms var(--ease-panel),
		color 150ms var(--ease-panel),
		rotate 250ms var(--ease-spring);
}
.nav-row:hover {
	background: var(--hover);
	color: var(--ink);
}
.nav-row {
	z-index: 1;
}
/* The page you are on: the card lying on top, which slides beneath the rows; its words turn with it. */
.nav-row[aria-current="page"] {
	color: var(--ink);
	font-weight: 500;
	background: transparent;
	rotate: var(--sel-turn, -0.8deg);
}
.nav-row[aria-current="page"]:hover {
	background: transparent;
}
.nav-sel {
	position: absolute;
	z-index: 0;
	border-radius: 6px;
	background: var(--raised);
	box-shadow: var(--paper-lift);
	rotate: var(--sel-turn, -0.8deg);
	opacity: 0;
	pointer-events: none;
	transition:
		top 260ms var(--ease-panel),
		height 260ms var(--ease-panel),
		rotate 260ms var(--ease-spring),
		opacity 150ms;
}
.nav-sel.on {
	opacity: 1;
}
.words {
	flex: 1;
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	transition: opacity 120ms ease-out;
}
/* A count beside the item: cards due, pieces open. Nothing when it is zero. */
.count {
	min-width: 22px;
	height: 20px;
	padding: 0 6px;
	border-radius: 6px;
	background: color-mix(in srgb, var(--accent-c) 18%, transparent);
	color: var(--ink);
	font-size: 12px;
	font-weight: 600;
	line-height: 20px;
	text-align: center;
	transition: opacity 120ms;
}
.side-section {
	display: flex;
	align-items: center;
	gap: 8px;
	margin: 20px 10px 6px;
	font-size: 12px;
	color: var(--muted);
	white-space: nowrap;
	transition: opacity 120ms ease-out;
}
.side-section::after {
	content: "";
	flex: 1;
	height: 1px;
	background: var(--line-soft);
}
/* Recent pieces: postcards in a pile, each with a stamp in its cover's colour; an unfinished one carries a dot. */
.recents {
	flex: 1;
	min-height: 0;
	overflow-y: auto;
	scrollbar-width: none;
	margin: 0 -2px;
	padding: 0 2px 8px;
	transition: opacity 150ms ease-out;
}
.postcard {
	position: relative;
	display: flex;
	align-items: center;
	gap: 10px;
	height: 38px;
	padding: 0 10px;
	border-radius: 6px;
	color: var(--ink-2);
	font-size: 13.5px;
	text-decoration: none;
	transition:
		background-color 150ms var(--ease-panel),
		color 150ms;
}
.postcard:hover {
	background: var(--hover);
	color: var(--ink);
}
.stamp-dot {
	width: 14px;
	height: 17px;
	flex: none;
	border-radius: 2px;
	background: var(--tone, #ddd);
	transform: rotate(var(--tilt, 0deg));
	box-shadow:
		0 0 0 2px var(--side-bg),
		0 0 0 2.5px color-mix(in srgb, var(--ink) 18%, transparent);
	transition: transform 220ms var(--ease-spring);
}
:global([data-theme="dark"]) .stamp-dot {
	background: var(--deep, #555);
}
.postcard:hover .stamp-dot {
	transform: rotate(0deg) scale(1.08);
}
.postcard .words {
	white-space: nowrap;
}
.clip {
	width: 6px;
	height: 6px;
	flex: none;
	border-radius: 50%;
	background: var(--accent-c);
}
.view-all {
	display: block;
	margin: 0;
	padding: 6px 10px;
	color: var(--muted);
	font-size: 13px;
	text-decoration: none;
	transition: color 150ms;
}
a.view-all:hover {
	color: var(--ink);
}
.side-foot {
	display: flex;
	align-items: center;
	gap: 6px;
	padding-top: 8px;
	border-top: 1px solid var(--line-soft);
}
.side-foot :global(.me) {
	position: relative;
	display: flex;
	flex: 1;
	min-width: 0;
	align-items: center;
	gap: 10px;
	height: 44px;
	padding: 0 8px;
	border: 0;
	border-radius: 6px;
	background: none;
	color: var(--ink);
	font-size: 14px;
	text-align: start;
	cursor: pointer;
	outline: none;
	transition: background-color 150ms;
}
.side-foot :global(.me:hover),
.side-foot :global(.me[data-state="open"]) {
	background: var(--hover);
}
.side-foot :global(.me:focus-visible),
.side-foot :global(.chip-lang:focus-visible),
.nav-row:focus-visible,
.postcard:focus-visible,
.fold-btn:focus-visible,
.wordmark:focus-visible {
	outline: none;
	box-shadow: 0 0 0 3px color-mix(in oklab, var(--ring-c) 60%, transparent);
}
.side-foot :global(.me .words) {
	white-space: nowrap;
}
.side-foot :global(.chip-lang) {
	display: inline-grid;
	place-items: center;
	flex: none;
	min-width: 38px;
	height: 32px;
	padding: 0 8px;
	border: 1px solid var(--line);
	border-radius: 6px;
	background: var(--raised);
	color: var(--ink);
	font-size: 12px;
	font-weight: 600;
	cursor: pointer;
	outline: none;
	transition:
		border-color 150ms,
		scale 150ms;
}
.side-foot :global(.chip-lang:hover),
.side-foot :global(.chip-lang[data-state="open"]) {
	border-color: color-mix(in srgb, var(--ink) 30%, transparent);
}
.side-foot :global(.chip-lang:active) {
	scale: 0.97;
}
:global(.menu-sep) {
	height: 1px;
	margin: 4px 6px;
	background: var(--line-soft);
}
:global(.code) {
	display: inline-grid;
	place-items: center;
	min-width: 26px;
	height: 22px;
	padding: 0 5px;
	border-radius: 6px;
	background: var(--well);
	color: var(--ink);
	font-size: 11px;
	font-weight: 600;
}

/* Folded: a rail of stickers. Words fade before the width moves, so nothing wraps on the way. */
:global(html.side-folded) .side .words,
:global(html.side-folded) .side .count,
:global(html.side-folded) .side-top .wordmark,
:global(html.side-folded) .side :global(.words) {
	opacity: 0;
	pointer-events: none;
}
:global(html.side-folded) .side-section,
:global(html.side-folded) .recents {
	opacity: 0;
	visibility: hidden;
	transition:
		opacity 120ms,
		visibility 0s 120ms;
}
:global(html.side-folded) .side-top {
	padding-inline-start: 0;
}
:global(html.side-folded) .side-top .wordmark {
	width: 0;
	flex: 0;
}
/* Folded, the chevron stands in the stickers' column, centred over them. */
:global(html.side-folded) .fold-btn {
	width: 44px;
	height: 44px;
	border-radius: 6px;
}
:global(html.side-folded) .nav-row {
	width: 44px;
	padding: 0 9px;
}
:global(html.side-folded) .side-foot {
	flex-direction: column-reverse;
	align-items: center;
}
:global(html.side-folded) .side-foot :global(.me) {
	width: 44px;
	flex: none;
	padding: 0 8px;
}
.scrim {
	position: fixed;
	inset: 0;
	z-index: 45;
	background: rgba(20, 16, 12, 0.3);
	opacity: 0;
	visibility: hidden;
	transition:
		opacity 150ms,
		visibility 0s 150ms;
}

/* On a phone the bar is a drawer over the page, opened from the wordmark in the top corner; it shows open whatever the
   desktop's folded flag says. */
@media (max-width: 899px) {
	.side {
		width: min(304px, 86vw);
		padding-top: max(12px, env(safe-area-inset-top));
		padding-bottom: max(10px, env(safe-area-inset-bottom));
		transform: translateX(-102%);
		transition: transform 150ms var(--ease-panel);
	}
	:global(html.drawer) .side {
		transform: none;
		transition-duration: 250ms;
		box-shadow: var(--pop);
	}
	:global(html.drawer) .scrim {
		opacity: 1;
		visibility: visible;
		transition: opacity 250ms;
	}
	.fold-btn {
		display: none;
	}
	.nav-row,
	.postcard,
	.side-foot :global(.me) {
		min-height: 48px;
	}
	:global(html.side-folded) .side .words,
	:global(html.side-folded) .side .count,
	:global(html.side-folded) .side-top .wordmark,
	:global(html.side-folded) .side :global(.words) {
		opacity: 1;
		pointer-events: auto;
	}
	:global(html.side-folded) .side-section,
	:global(html.side-folded) .recents {
		opacity: 1;
		visibility: visible;
	}
	:global(html.side-folded) .side-top {
		padding-inline-start: 8px;
	}
	:global(html.side-folded) .side-top .wordmark {
		width: auto;
		flex: 1;
	}
	:global(html.side-folded) .nav-row {
		width: auto;
		padding: 0 10px;
	}
	:global(html.side-folded) .side-foot {
		flex-direction: row;
	}
	:global(html.side-folded) .side-foot :global(.me) {
		width: auto;
		flex: 1;
	}
}
@media (prefers-reduced-motion: reduce) {
	.side,
	.nav-sel {
		transition: none;
		animation: none;
	}
}
</style>
