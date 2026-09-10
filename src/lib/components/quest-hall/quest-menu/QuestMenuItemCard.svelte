<script lang="ts">
import ArrowRight from "@lucide/svelte/icons/arrow-right";
import Mail from "@lucide/svelte/icons/mail";
import { base } from "$app/paths";
import type { LanguageCode } from "$lib/constants";
import { t } from "$lib/i18n";
import { getQuestMenuItemHref, type QuestMenuItem, type QuestMenuItemState } from "$lib/quest-hall/menu";
import QuestMenuItemIndicator from "./QuestMenuItemIndicator.svelte";
import QuestMenuStatusMark from "./QuestMenuStatusMark.svelte";

interface Props {
	item: QuestMenuItem;
	lang: LanguageCode;
	compact?: boolean;
	onselect?: (item: QuestMenuItem, event: MouseEvent) => void;
}

let { item, lang, compact = false, onselect }: Props = $props();
let title = $derived(item.kind === "quest" ? item.task.title : item.task.titleBase);
let objective = $derived(item.kind === "quest" ? item.task.shortObjective : item.task.descriptionBase);

function statusLabel(state: QuestMenuItemState): string {
	return t(lang, `hall.menu.status.${state}`);
}
</script>

<article class="task-card" class:is-compact={compact} class:is-finished={item.state === "finished"} class:is-active={item.state === "active"}>
	<div class="task-overline"><span>{String(item.ordinal).padStart(2, "0")}</span></div>
	<div class="status-row">
		<QuestMenuStatusMark state={item.state} label={statusLabel(item.state)} variant={item.state === "finished" ? "stamp" : "line"} />
		{#if item.hasUnread}
			<span class="unread"><Mail size={13} aria-hidden="true" /> {t(lang, "hall.unreadReply")}</span>
		{/if}
	</div>
	<h3>{title}</h3>
	{#if objective}
		<p class="font-prose">{objective}</p>
	{/if}
	<div class="meta"><QuestMenuItemIndicator {item} {lang} /></div>
	<a class="detail-link" href={getQuestMenuItemHref(item, base)} onclick={(event) => onselect?.(item, event)}>
		{t(lang, "hall.menu.viewDetails")} <ArrowRight size={16} aria-hidden="true" />
	</a>
</article>

<style>
.task-card {
	position: relative;
	display: flex;
	min-width: 0;
	flex: 1;
	flex-direction: column;
	gap: 0.85rem;
	padding: 1.25rem 0.8rem;
	text-align: center;
	border-block: 1px solid color-mix(in oklab, var(--menu-ink) 14%, transparent);
}

.task-card:hover {
	border-color: color-mix(in oklab, var(--menu-wine) 48%, transparent);
}

.is-finished {
	background: color-mix(in oklab, var(--menu-green) 4%, transparent);
}

.is-active {
	background: transparent;
}

.task-card :global(.status) {
	align-self: center;
	font-size: 0.6rem;
	letter-spacing: 0.06em;
}

.task-overline,
.meta {
	display: flex;
	flex-wrap: wrap;
	justify-content: space-between;
	gap: 0.4rem 0.8rem;
	font-family: var(--font-sans);
	font-size: 0.64rem;
	font-weight: 700;
	letter-spacing: 0.08em;
	text-transform: uppercase;
	color: var(--menu-ink-muted);
}

.task-card h3 {
	margin: 0.1rem 0 0;
	font-family: var(--font-serif);
	font-size: clamp(1.2rem, 2.15vw, 1.6rem);
	font-weight: 380;
	line-height: 1.12;
	text-wrap: balance;
	overflow-wrap: anywhere;
}

.task-card > p {
	display: -webkit-box;
	overflow: hidden;
	font-size: 1rem;
	line-height: 1.62;
	color: var(--menu-ink-muted);
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 3;
	line-clamp: 3;
}

.meta {
	justify-content: center;
	margin-top: auto;
	font-size: 0.72rem;
	letter-spacing: 0;
	text-transform: none;
}

.status-row {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 0.65rem;
}

.unread {
	display: inline-flex;
	align-items: center;
	gap: 0.3rem;
}

.unread {
	width: fit-content;
	color: var(--menu-wine);
	font-family: var(--font-sans);
	font-size: 0.68rem;
	font-weight: 750;
}

.detail-link {
	display: inline-flex;
	width: fit-content;
	min-height: 44px;
	align-self: center;
	align-items: center;
	gap: 0.35rem;
	margin-top: 0.35rem;
	padding: 0.48rem 0.68rem;
	border: 1px solid color-mix(in oklab, var(--menu-wine) 22%, transparent);
	border-radius: 999px;
	color: var(--menu-wine);
	font-family: var(--font-sans);
	font-size: 0.74rem;
	font-weight: 750;
	text-decoration: none;
	transition:
		color 180ms ease,
		background-color 180ms ease,
		box-shadow 180ms ease,
		transform 180ms ease;
}

.detail-link :global(svg) {
	transition: transform 180ms ease;
}

@media (hover: hover) and (pointer: fine) {
	.detail-link:hover {
		color: var(--menu-sheet);
		background: var(--menu-wine);
		box-shadow: 0 6px 14px color-mix(in oklab, var(--menu-wine) 22%, transparent);
		transform: translateY(-2px);
	}

	.detail-link:hover :global(svg) {
		transform: translateX(3px);
	}
}

.detail-link:focus-visible {
	border-radius: 0.15rem;
	outline: 2px solid var(--menu-focus);
	outline-offset: 3px;
}

.is-compact {
	min-height: 0;
	gap: 0.3rem;
	padding-block: 0.55rem;
}

.is-compact h3 {
	display: -webkit-box;
	font-size: clamp(1.05rem, 2vw, 1.4rem);
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 2;
	line-clamp: 2;
}

.is-compact > p {
	display: none;
}

.is-compact .detail-link {
	min-height: 44px;
}

@media (prefers-reduced-motion: reduce) {
	.detail-link,
	.detail-link :global(svg) {
		transition: none;
	}

	.detail-link:hover,
	.detail-link:hover :global(svg) {
		transform: none;
	}
}
</style>
