<script lang="ts">
import ChevronRight from "@lucide/svelte/icons/chevron-right";
import Mail from "@lucide/svelte/icons/mail";
import X from "@lucide/svelte/icons/x";
import { fade } from "svelte/transition";
import { base } from "$app/paths";
import type { UnreadSubscriptionStatus } from "$lib/client/quest-hall/unread-subscription";
import { UI_VARIANT_LABELS, type UiVariant } from "$lib/constants";
import { type LanguageCode, t } from "$lib/i18n";
import { formatRelativeAge, formatUnreadBadgeCount, type UnreadInboxItem, unreadTargetHref } from "$lib/unread";

interface Props {
	items: UnreadInboxItem[];
	total: number;
	status: UnreadSubscriptionStatus;
	lang: LanguageCode;
}

let { items, total, status, lang }: Props = $props();
let isOpen = $state(false);
let container = $state<HTMLElement | null>(null);
let trigger = $state<HTMLButtonElement | null>(null);

const panelId = "quest-menu-unread-panel";
const panelTitleId = "quest-menu-unread-title";
let countLabel = $derived(t(lang, total === 1 ? "hall.unreadCountOne" : "hall.unreadCountMany").replace("{count}", String(total)));

function close(restoreFocus = false): void {
	if (!isOpen) return;
	isOpen = false;
	if (restoreFocus) queueMicrotask(() => trigger?.focus());
}

$effect(() => {
	const onKeydown = (event: KeyboardEvent) => {
		if (event.key !== "Escape" || !isOpen) return;
		event.preventDefault();
		close(true);
	};
	const onPointerdown = (event: PointerEvent) => {
		if (container && !container.contains(event.target as Node)) close();
	};
	window.addEventListener("keydown", onKeydown);
	document.addEventListener("pointerdown", onPointerdown);
	return () => {
		window.removeEventListener("keydown", onKeydown);
		document.removeEventListener("pointerdown", onPointerdown);
	};
});
</script>

<div class="menu-inbox" bind:this={container}>
	<span class="status-announcement" role="status" aria-atomic="true">{countLabel}</span>
	<button
		bind:this={trigger}
		type="button"
		class="inbox-trigger"
		aria-label={`${t(lang, "hall.unreadTrigger")}: ${countLabel}`}
		aria-expanded={isOpen}
		aria-controls={panelId}
		onclick={() => (isOpen = !isOpen)}
	>
		<Mail size={17} strokeWidth={1.65} aria-hidden="true" />
		<span class="trigger-label">{t(lang, "hall.unreadTrigger")}</span>
		{#if total > 0}
			<span class="trigger-count" aria-hidden="true">{formatUnreadBadgeCount(total)}</span>
		{/if}
	</button>

	{#if isOpen}
		<section id={panelId} class="inbox-panel" aria-labelledby={panelTitleId} transition:fade={{ duration: 140 }}>
			<header class="inbox-header">
				<div>
					<p class="inbox-kicker">{t(lang, "hall.unreadTrigger")}</p>
					<h2 id={panelTitleId}>{t(lang, "hall.unreadInboxTitle")}</h2>
				</div>
				<div class="header-actions">
					{#if total > 0}
						<span class="inbox-total">{total}</span>
					{/if}
					<button type="button" class="close-button" aria-label={t(lang, "hall.unreadClose")} onclick={() => close(true)}>
						<X size={16} strokeWidth={1.75} aria-hidden="true" />
					</button>
				</div>
			</header>

			{#if status === "error"}
				<p class="inbox-notice">{t(lang, "hall.unreadError")}</p>
			{/if}

			{#if status === "loading" && items.length === 0}
				<p class="inbox-empty">{t(lang, "hall.unreadLoading")}</p>
			{:else if items.length === 0}
				<p class="inbox-empty">{t(lang, "hall.unreadEmpty")}</p>
			{:else}
				<ul>
					{#each items as item (item.taskId)}
						<li>
							<a href={unreadTargetHref(item, base)} class="inbox-item" onclick={() => close()}>
								<span class="item-meta">
									<span class="item-channel">{UI_VARIANT_LABELS[item.ui as UiVariant] ?? item.ui}</span>
									{#if item.latestAgeSeconds !== null}
										<span class="item-age">{formatRelativeAge(item.latestAgeSeconds, lang)}</span>
									{/if}
								</span>
								<span class="item-title">{item.title}</span>
								<span class="item-row">
									<span class="item-count">
										<Mail size={12} strokeWidth={1.75} aria-hidden="true" />
										{t(lang, "hall.unreadReply")}{item.unreadCount > 1 ? ` × ${item.unreadCount}` : ""}
									</span>
									<span class="item-chevron"><ChevronRight size={15} strokeWidth={1.5} aria-hidden="true" /></span>
								</span>
							</a>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	{/if}
</div>

<style>
.menu-inbox {
	position: relative;
	flex: 0 0 auto;
	font-family: var(--font-sans);
}

.status-announcement {
	position: absolute;
	width: 1px;
	height: 1px;
	padding: 0;
	margin: -1px;
	overflow: hidden;
	clip: rect(0, 0, 0, 0);
	white-space: nowrap;
	border: 0;
}

.inbox-trigger {
	display: inline-flex;
	min-height: 44px;
	align-items: center;
	gap: 0.48rem;
	padding: 0.45rem 0.62rem 0.45rem 0.72rem;
	border: 1px solid color-mix(in oklab, var(--menu-ink) 18%, transparent);
	border-radius: 999px;
	background: color-mix(in oklab, var(--menu-sheet) 48%, transparent);
	color: var(--menu-ink-muted);
	font-size: 0.69rem;
	font-weight: 650;
	letter-spacing: 0.08em;
	text-transform: uppercase;
	cursor: pointer;
	box-shadow: 0 0.15rem 0.5rem rgb(74 59 43 / 0.035);
	transition:
		background-color 160ms ease,
		border-color 160ms ease,
		color 160ms ease,
		transform 160ms ease;
}

.inbox-trigger:hover,
.inbox-trigger[aria-expanded="true"] {
	border-color: color-mix(in oklab, var(--menu-wine) 42%, transparent);
	background: color-mix(in oklab, var(--menu-sheet) 78%, transparent);
	color: var(--menu-wine);
}

.inbox-trigger:active {
	transform: translateY(1px);
}

.inbox-trigger:focus-visible,
.close-button:focus-visible,
.inbox-item:focus-visible {
	outline: 2px solid var(--menu-focus);
	outline-offset: 2px;
}

.trigger-count {
	display: inline-grid;
	min-width: 1.28rem;
	height: 1.28rem;
	place-items: center;
	padding-inline: 0.24rem;
	border-radius: 999px;
	background: var(--menu-wine);
	color: #fffaf1;
	font-size: 0.64rem;
	font-weight: 750;
	letter-spacing: 0;
	line-height: 1;
}

.inbox-panel {
	position: absolute;
	top: calc(100% + 0.65rem);
	right: 0;
	z-index: 60;
	width: min(23rem, calc(100vw - 3rem));
	overflow: hidden;
	border: 1px solid color-mix(in oklab, var(--menu-ink) 18%, transparent);
	border-radius: 0.55rem;
	background:
		linear-gradient(color-mix(in oklab, var(--menu-sheet) 94%, transparent), color-mix(in oklab, var(--menu-paper) 96%, transparent)),
		var(--menu-paper);
	box-shadow: 0 1.1rem 2.8rem rgb(63 48 34 / 0.16);
	color: var(--menu-ink);
}

.inbox-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 1rem;
	padding: 0.85rem 0.9rem 0.75rem 1rem;
	border-bottom: 1px solid color-mix(in oklab, var(--menu-ink) 12%, transparent);
}

.inbox-kicker {
	margin: 0 0 0.16rem;
	color: var(--menu-wine);
	font-size: 0.57rem;
	font-weight: 700;
	letter-spacing: 0.16em;
	text-transform: uppercase;
}

.inbox-header h2 {
	margin: 0;
	font-family: var(--font-serif);
	font-size: 1.12rem;
	font-weight: 450;
	line-height: 1.1;
}

.header-actions {
	display: flex;
	align-items: center;
	gap: 0.45rem;
}

.inbox-total {
	display: inline-grid;
	min-width: 1.45rem;
	height: 1.45rem;
	place-items: center;
	padding-inline: 0.25rem;
	border: 1px solid color-mix(in oklab, var(--menu-wine) 32%, transparent);
	border-radius: 999px;
	color: var(--menu-wine);
	font-size: 0.67rem;
	font-weight: 720;
}

.close-button {
	display: inline-grid;
	width: 44px;
	height: 44px;
	place-items: center;
	padding: 0;
	border: 0;
	border-radius: 999px;
	background: transparent;
	color: var(--menu-ink-muted);
	cursor: pointer;
}

.close-button:hover {
	background: color-mix(in oklab, var(--menu-ink) 7%, transparent);
	color: var(--menu-ink);
}

.inbox-notice,
.inbox-empty {
	margin: 0;
	padding: 0.85rem 1rem;
	color: var(--menu-ink-muted);
	font-size: 0.78rem;
	line-height: 1.5;
}

.inbox-notice {
	border-bottom: 1px solid color-mix(in oklab, var(--menu-wine) 13%, transparent);
	background: color-mix(in oklab, var(--menu-wine) 5%, transparent);
	color: color-mix(in oklab, var(--menu-wine) 70%, var(--menu-ink));
}

.inbox-panel ul {
	max-height: min(24rem, 62vh);
	margin: 0;
	padding: 0;
	overflow-y: auto;
	list-style: none;
}

.inbox-item {
	display: flex;
	flex-direction: column;
	gap: 0.22rem;
	padding: 0.72rem 1rem 0.78rem;
	border-bottom: 1px solid color-mix(in oklab, var(--menu-ink) 10%, transparent);
	text-decoration: none;
	transition: background-color 150ms ease;
}

li:last-child .inbox-item {
	border-bottom: 0;
}

.inbox-item:hover {
	background: color-mix(in oklab, var(--menu-wine) 5%, transparent);
}

.item-meta,
.item-row {
	display: flex;
	align-items: baseline;
	justify-content: space-between;
	gap: 0.75rem;
}

.item-channel {
	color: var(--menu-olive);
	font-size: 0.57rem;
	font-weight: 720;
	letter-spacing: 0.13em;
	text-transform: uppercase;
}

.item-age {
	flex: 0 0 auto;
	color: var(--menu-ink-muted);
	font-size: 0.64rem;
}

.item-title {
	color: var(--menu-ink);
	font-family: var(--font-serif);
	font-size: 0.95rem;
	font-weight: 430;
	line-height: 1.25;
}

.item-row {
	margin-top: 0.1rem;
}

.item-count {
	display: inline-flex;
	align-items: center;
	gap: 0.32rem;
	color: var(--menu-wine);
	font-size: 0.67rem;
	font-weight: 650;
}

.item-chevron {
	flex: 0 0 auto;
	color: var(--menu-ink-muted);
}

@media (max-width: 40rem) {
	.trigger-label {
		display: none;
	}

	.inbox-trigger {
		min-width: 2.4rem;
		justify-content: center;
		padding-inline: 0.62rem;
	}
}
</style>
