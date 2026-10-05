<script lang="ts">
import Megaphone from "@lucide/svelte/icons/megaphone";
import { tick } from "svelte";
import { base } from "$app/paths";
import { hoverMarquee } from "$lib/client/hover-marquee";
import MarkdownRenderer from "$lib/components/common/MarkdownRenderer.svelte";
import type { UnreadSubscriptionStatus } from "$lib/components/quest-hall/unread-subscription";
import { type LanguageCode, UI_VARIANT_LABELS, type UiVariant } from "$lib/constants";
import { t } from "$lib/i18n";
import { formatRelativeAge, type UnreadInboxItem, unreadTargetHref } from "$lib/practice/unread";
import type { HallAnnouncement } from "$lib/server/announcement";
import { getDisplayClock } from "$lib/time/display-clock";
import { collapseToDot } from "./announcement-motion";
import NotificationIcon from "./NotificationIcon.svelte";

interface Props {
	items: UnreadInboxItem[];
	total: number;
	status: UnreadSubscriptionStatus;
	/** Unread announcements; they stack above the replies. */
	announcements?: HallAnnouncement[];
	/** Called with the card once it has closed into a dot; resolves when it has been put away. */
	onacknowledge?: (id: number, card: HTMLElement) => Promise<void>;
	lang: LanguageCode;
}

let { items, total, status, announcements = [], onacknowledge, lang }: Props = $props();
let expanded = $state(false);
/** The announcement whose card is open as an island; the rest of the stack steps back. */
let openId = $state<number | null>(null);
let leavingId = $state<number | null>(null);
let openHeight = $state(68);
let container = $state<HTMLElement>();
let pointerType = "";
const displayClock = getDisplayClock();

type Entry = { key: string; announcement: HallAnnouncement; item?: never } | { key: string; item: UnreadInboxItem; announcement?: never };
let entries = $derived<Entry[]>([
	...announcements.map((announcement) => ({ key: `announcement-${announcement.id}`, announcement })),
	...items.map((item) => ({ key: `reply-${item.sessionId}`, item })),
]);

$effect(() => {
	if (openId !== null && !announcements.some((announcement) => announcement.id === openId)) openId = null;
});

function close() {
	expanded = false;
	if (leavingId === null) openId = null;
}

function toggle(id: number) {
	if (leavingId !== null) return;
	openId = openId === id ? null : id;
	expanded = false;
}

/** Tracks the open island's natural height (capped by CSS), measured at its final width. */
function measure(node: HTMLElement) {
	const observer = new ResizeObserver(() => {
		const card = node.parentElement;
		openHeight = node.offsetHeight + (card ? card.offsetHeight - card.clientHeight : 0);
	});
	observer.observe(node);
	return () => observer.disconnect();
}

async function acknowledge(id: number, card: HTMLElement | null, fromKeyboard: boolean) {
	if (!card || leavingId !== null) return;
	leavingId = id;
	await collapseToDot(card, "#713342");
	await onacknowledge?.(id, card);
	leavingId = null;
	openId = null;
	if (fromKeyboard) {
		await tick();
		container?.querySelector<HTMLElement>("a.notification:not([inert]), .notification:not([inert]) .summary")?.focus({ preventScroll: true });
	}
}

function publishedOn(date: Date): string {
	return new Intl.DateTimeFormat(lang, { month: "short", day: "numeric", timeZone: displayClock().timeZone }).format(date);
}
</script>

<svelte:document
	onpointerdown={(event) => { if (!container?.contains(event.target as Node)) close(); }}
	onkeydown={(event) => {
	if (event.key !== "Escape" || (!expanded && openId === null) || leavingId !== null) return;
	const opened = openId;
	close();
	container?.querySelector<HTMLElement>(opened === null ? "a, button" : `#announcement-${opened}-summary`)?.focus({ preventScroll: true });
}}
/>

<span class="sr-only" role="status"
	>{t(lang, "hall.unreadTrigger")}: {t(lang, total === 1 ? "hall.unreadCountOne" : "hall.unreadCountMany").replace("{count}", String(total))}</span
>
{#if entries.length > 0}
	<section
		bind:this={container}
		class="notifications"
		class:expanded
		class:has-open={openId !== null}
		aria-label={t(lang, "hall.unreadTrigger")}
		style:--open-height="{openHeight}px"
		onpointerenter={(event) => { if (event.pointerType === "mouse" && openId === null) expanded = true; }}
		onpointerleave={(event) => { if (event.pointerType === "mouse" && !container?.contains(document.activeElement)) expanded = false; }}
		onfocusout={(event) => { if (event.relatedTarget && !container?.contains(event.relatedTarget as Node)) close(); }}
	>
		<div class="cards" style:--count={entries.length}>
			{#each entries as entry, index (entry.key)}
				{#if entry.announcement}
					{@const announcement = entry.announcement}
					{@const open = openId === announcement.id}
					<article
						class="notification announcement"
						class:open
						style:--index={index}
						style:--depth={Math.min(index, 2)}
						inert={openId === null ? !expanded && index > 0 : !open}
						aria-labelledby="announcement-{announcement.id}-title"
					>
						<div class="island" {@attach open ? measure : null}>
							<button
								type="button"
								id="announcement-{announcement.id}-summary"
								class="summary"
								aria-expanded={open}
								aria-controls="announcement-{announcement.id}-detail"
								onclick={() => toggle(announcement.id)}
							>
								<span class="icon"><Megaphone size={20} aria-hidden="true" /></span>
								<span class="copy">
									<span class="meta"><span>{t(lang, "hall.announcement.label")}</span> <span>{publishedOn(announcement.publishedAt)}</span></span>
									<span class="title" id="announcement-{announcement.id}-title">{announcement.title}</span>
									<span class="reply">{t(lang, "hall.announcement.read")}</span>
								</span>
							</button>
							<div class="detail" id="announcement-{announcement.id}-detail" inert={!open}>
								<div class="body"><MarkdownRenderer content={announcement.body} /></div>
								<div class="actions">
									<button type="button" class="quiet" onclick={close}>{t(lang, "hall.announcement.close")}</button>
									<button
										type="button"
										class="acknowledge"
										onclick={(event) => acknowledge(announcement.id, event.currentTarget.closest("article"), event.detail === 0)}
									>
										{t(lang, "hall.announcement.acknowledge")}
									</button>
								</div>
							</div>
						</div>
					</article>
				{:else if entry.item}
					{@const item = entry.item}
					<a
						href={unreadTargetHref(item, base)}
						class="notification"
						style:--index={index}
						style:--depth={Math.min(index, 2)}
						inert={openId !== null || (!expanded && index > 0)}
						onpointerdown={(event) => { pointerType = event.pointerType; }}
						onclick={(event) => {
							if (!expanded && (pointerType !== "mouse" || event.detail === 0)) { event.preventDefault(); expanded = true; }
							pointerType = "";
						}}
						onkeydown={(event) => { if (event.key === "ArrowDown") { event.preventDefault(); expanded = true; } }}
						use:hoverMarquee
					>
						<span class="icon"><NotificationIcon ui={item.ui} /></span>
						<span class="copy">
							<span class="meta"
								><span>{UI_VARIANT_LABELS[item.ui as UiVariant] ?? item.ui}</span>
								{#if item.latestAgeSeconds !== null}
									<span>{formatRelativeAge(item.latestAgeSeconds, lang)}</span>
								{/if}
							</span>
							<span class="title" data-marquee><span class="title-text">{item.title}</span></span>
							<span class="reply">{t(lang, "hall.unreadReply")}{item.unreadCount > 1 ? ` × ${item.unreadCount}` : ""}</span>
						</span>
					</a>
				{/if}
			{/each}
		</div>
		<span class="sr-only" role="status">{total}</span>
		{#if status === "error"}
			<p class="notice">{t(lang, "hall.unreadError")}</p>
		{/if}
	</section>
{:else if status === "error"}
	<p class="notice" role="status">{t(lang, "hall.unreadError")}</p>
{/if}

<style>
.notifications {
	/* A damped spring (ratio 0.72): the island overshoots its size by ~4% and settles. */
	--ease-island: linear(
		0,
		0.039,
		0.133,
		0.257,
		0.391,
		0.523,
		0.642,
		0.746,
		0.832,
		0.9,
		0.951,
		0.988,
		1.013,
		1.028,
		1.036,
		1.038,
		1.037,
		1.034,
		1.029,
		1.024,
		1.019,
		1.014,
		1.01,
		1.007,
		1.004,
		1.002,
		1.001,
		1
	);
	--ease-settle: cubic-bezier(0.32, 0, 0.2, 1);
	--island-width: min(26rem, calc(100vw - 2rem));
	width: min(20rem, calc(100vw - 2rem));
	font-family: var(--font-sans);
	transition: width 300ms var(--ease-settle);
}
.notifications.has-open {
	width: var(--island-width);
	transition: width 560ms var(--ease-island);
}
.cards {
	position: relative;
	height: 86px;
	transition: height 300ms var(--ease-settle);
}
.expanded .cards {
	height: min(calc(var(--count) * 76px), 65dvh);
	overflow-y: auto;
	overscroll-behavior: contain;
	transition: height 420ms cubic-bezier(0.22, 1, 0.36, 1);
}
.has-open .cards {
	height: var(--open-height);
	transition: height 560ms var(--ease-island);
}
.notification {
	position: absolute;
	top: 0;
	left: 0;
	width: 100%;
	height: 68px;
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 8px 12px;
	border: 1px solid #8b817329;
	border-radius: 16px;
	background: #fafaf9ed;
	backdrop-filter: blur(20px);
	box-shadow: 0 0.15rem 0.5rem rgb(74 59 43 / 0.035);
	color: var(--foreground);
	text-decoration: none;
	transform-origin: top center;
	transform: translateY(calc(var(--depth) * 9px)) scale(calc(1 - var(--depth) * 0.045));
	z-index: calc(var(--count) - var(--index));
	opacity: 0;
	transition:
		transform 300ms var(--ease-settle),
		opacity 220ms ease-out,
		background 220ms ease-out;
}
.notification:nth-child(-n + 3) {
	opacity: 1;
}
.expanded .notification {
	transform: translateY(calc(var(--index) * 76px));
	opacity: 1;
	/* Depth changes settling time, not start time, so quick reversals stay responsive. */
	transition:
		transform calc(380ms + var(--depth) * 35ms) cubic-bezier(0.22, 1.12, 0.36, 1),
		opacity 260ms ease-out,
		background 220ms ease-out;
}
/* The rest of the stack steps back behind the island and rises again once it has gone. */
.has-open .notification:not(.open) {
	transform: translateY(14px) scale(0.94);
	opacity: 0;
	pointer-events: none;
}
.notification:hover {
	background: #fafaf9;
}
.notification:focus-visible {
	outline: 2px solid var(--ring);
	outline-offset: -3px;
}
.icon {
	display: grid;
	place-items: center;
	width: 30px;
	height: 30px;
	flex: 0 0 auto;
	color: var(--muted-foreground);
}
.icon :global(svg) {
	width: 20px;
	height: 20px;
}
.copy {
	flex: 1;
	min-width: 0;
	display: flex;
	flex-direction: column;
	gap: 1px;
}
.meta {
	display: flex;
	justify-content: space-between;
	gap: 8px;
	font-size: 0.62rem;
	color: var(--muted-foreground);
}
.title {
	font-size: 0.8rem;
	font-weight: 550;
	overflow: hidden;
	white-space: nowrap;
}
.title-text {
	display: block;
	overflow: hidden;
	text-overflow: ellipsis;
}
/* While the title scrolls, the full text is on its way into view — no ellipsis to trim it. */
.title:global([data-marquee-active]) .title-text {
	width: max-content;
	overflow: visible;
	text-overflow: clip;
}
.reply {
	font-size: 0.68rem;
	color: var(--muted-foreground);
}

/* An announcement is the same card, grown in place into an island that holds the whole notice. */
.announcement {
	display: block;
	padding: 0;
	overflow: hidden;
	text-align: left;
	transition:
		transform 300ms var(--ease-settle),
		opacity 220ms ease-out,
		background 220ms ease-out,
		height 300ms var(--ease-settle),
		border-radius 300ms var(--ease-settle),
		box-shadow 300ms var(--ease-settle);
}
.announcement.open {
	z-index: calc(var(--count) + 1);
	height: var(--open-height);
	border-radius: 24px;
	background: #fafaf9f5;
	box-shadow: 0 1.25rem 3rem -1rem rgb(74 59 43 / 0.28);
	transform: none;
	opacity: 1;
	transition:
		transform 560ms var(--ease-island),
		opacity 220ms ease-out,
		height 560ms var(--ease-island),
		border-radius 560ms var(--ease-island),
		box-shadow 560ms var(--ease-island);
}
.island {
	display: flex;
	width: 100%;
	max-height: min(70dvh, 34rem);
	flex-direction: column;
}
/* Lay the island out at its final width at once, so its height is measured once, not every frame. */
.open .island {
	width: var(--island-width);
}
.summary {
	display: flex;
	min-height: 66px;
	flex: 0 0 auto;
	align-items: center;
	gap: 10px;
	padding: 8px 12px;
	border-radius: inherit;
	color: inherit;
	text-align: left;
	cursor: pointer;
}
.summary:focus-visible,
.detail button:focus-visible {
	outline: 2px solid var(--ring);
	outline-offset: -3px;
}
.summary .title {
	text-overflow: ellipsis;
}
.open .summary {
	align-items: flex-start;
	padding: 16px 18px 8px;
	cursor: default;
}
.open .summary .icon {
	color: #713342;
}
.open .summary .title {
	font-size: 0.95rem;
	white-space: normal;
	text-wrap: pretty;
}
.open .summary .reply {
	display: none;
}
.detail {
	display: flex;
	min-height: 0;
	flex-direction: column;
	gap: 12px;
	padding: 0 18px 16px 58px;
	opacity: 0;
	transition: opacity 120ms ease-out;
}
.open .detail {
	opacity: 1;
	transition: opacity 260ms ease-out 140ms;
}
.body :global(.markdown-body > :first-child) {
	margin-top: 0;
}
.body {
	min-height: 0;
	overflow-y: auto;
	overscroll-behavior: contain;
	font-size: 0.85rem;
	line-height: 1.6;
	user-select: text;
}
.actions {
	display: flex;
	flex: 0 0 auto;
	justify-content: flex-end;
	gap: 6px;
}
.actions button {
	min-height: 32px;
	padding: 0 14px;
	border-radius: 999px;
	font-size: 0.78rem;
	font-weight: 600;
	transition:
		background-color 150ms ease-out,
		scale 150ms ease-out;
}
.actions button:active {
	scale: 0.97;
}
.quiet {
	color: var(--muted-foreground);
}
.quiet:hover {
	background: rgb(45 41 36 / 0.06);
}
.acknowledge {
	background: #713342;
	color: #fff4de;
}
.acknowledge:hover {
	background: #5f2b37;
}
@media (pointer: coarse) {
	.actions button {
		min-height: 40px;
	}
}

.notice {
	padding: 12px;
	border-radius: 12px;
	background: #fafaf9ed;
	font-size: 0.75rem;
}
@media (prefers-reduced-motion: reduce) {
	.notifications,
	.notifications.has-open,
	.notifications :is(.cards, .notification, .detail) {
		transition: none;
	}
}
</style>
