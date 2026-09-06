<script lang="ts">
import ArrowRight from "@lucide/svelte/icons/arrow-right";
import Mail from "@lucide/svelte/icons/mail";
import { base } from "$app/paths";
import type { LanguageCode } from "$lib/constants";
import { t } from "$lib/i18n";
import { getQuestMenuItemHref, type QuestMenuItem, type QuestMenuSection } from "$lib/quest-hall/menu";
import QuestMenuRibbonTabs, { type QuestMenuRibbon } from "./QuestMenuRibbonTabs.svelte";

interface Props {
	visible: boolean;
	interactive: boolean;
	recommendations: QuestMenuItem[];
	ribbons: QuestMenuRibbon[];
	selectedSection: QuestMenuSection;
	lang: LanguageCode;
	bookSlot?: HTMLButtonElement | null;
	stageElement?: HTMLElement | null;
	recommendationsElement?: HTMLDivElement | null;
	onopen: () => void;
	onselect: (section: QuestMenuSection) => void;
	onselectitem: (item: QuestMenuItem, event: MouseEvent) => void;
}

let {
	visible,
	interactive,
	recommendations,
	ribbons,
	selectedSection,
	lang,
	bookSlot = $bindable(null),
	stageElement = $bindable(null),
	recommendationsElement = $bindable(null),
	onopen,
	onselect,
	onselectitem,
}: Props = $props();

function sectionLabel(section: QuestMenuSection): string {
	if (section === "daily") return t(lang, "hall.today");
	if (section === "weekly") return t(lang, "hall.thisWeek");
	return t(lang, "translate.title");
}

function itemTitle(item: QuestMenuItem): string {
	return item.kind === "quest" ? item.task.title : item.task.titleBase;
}

function itemObjective(item: QuestMenuItem): string | null {
	return item.kind === "quest" ? item.task.shortObjective : item.task.descriptionBase;
}
</script>

<section bind:this={stageElement} class="home-stage" aria-label={t(lang, "hall.menu.recommendations")} aria-hidden={!visible} inert={!interactive}>
	<div class="home-grid">
		<div class="recommendations" bind:this={recommendationsElement}>
			<p class="section-kicker">{t(lang, "hall.menu.recommendations")}</p>
			{#if recommendations.length === 0}
				<div class="all-done">
					<strong>{t(lang, "hall.menu.allDoneTitle")}</strong>
					<p class="font-prose">{t(lang, "hall.menu.allDoneBody")}</p>
				</div>
			{:else}
				<div class="recommendation-list">
					{#each recommendations as item, index (item.key)}
						<article class="recommendation-card" class:is-primary={index === 0} class:is-unread={item.hasUnread}>
							<div class="recommendation-overline">
								<span>{t(lang, index === 0 ? "hall.menu.primaryRecommendation" : "hall.menu.otherRecommendation")}</span>
								<span>{sectionLabel(item.section)}</span>
							</div>
							{#if item.hasUnread}
								<span class="unread-mark"><Mail size={13} aria-hidden="true" /> {t(lang, "hall.unreadReply")}</span>
							{/if}
							<h2>{itemTitle(item)}</h2>
							{#if itemObjective(item)}
								<p class="font-prose">{itemObjective(item)}</p>
							{/if}
							<a href={getQuestMenuItemHref(item, base)} onclick={(event) => onselectitem(item, event)}>
								{t(lang, "hall.menu.viewDetails")} <ArrowRight size={16} aria-hidden="true" />
							</a>
						</article>
					{/each}
				</div>
			{/if}
			<button type="button" class="mobile-catalog-link" onclick={onopen}>
				{t(lang, "hall.menu.browseMissions")} <ArrowRight size={16} aria-hidden="true" />
			</button>
		</div>

		<div class="closed-book-zone">
			<div class="closed-book-stack">
				<button
					bind:this={bookSlot}
					type="button"
					class="home-book-slot"
					aria-label={t(lang, "hall.menu.open")}
					aria-expanded={!visible}
					onclick={onopen}
				></button>
				<div class="closed-ribbons">
					<QuestMenuRibbonTabs tabs={ribbons} value={selectedSection} label={t(lang, "hall.menu.sectionTabs")} {onselect} />
				</div>
			</div>
		</div>
	</div>
</section>

<style>
.home-stage {
	grid-area: 1 / 1;
}

.home-stage[aria-hidden="true"] {
	visibility: hidden;
	opacity: 0;
	pointer-events: none;
}

.home-grid {
	display: grid;
	grid-template-columns: minmax(0, 0.95fr) minmax(22rem, 1.05fr);
	align-items: center;
	gap: clamp(2.5rem, 7vw, 7rem);
	min-height: clamp(38rem, 58vw, 47rem);
	max-width: 74rem;
	margin: 0 auto;
}

.section-kicker {
	font-family: var(--font-sans);
	font-size: 0.68rem;
	font-weight: 750;
	letter-spacing: 0.13em;
	text-transform: uppercase;
	color: var(--menu-wine);
}

.recommendation-overline {
	font-family: var(--font-sans);
	font-size: 0.64rem;
	font-weight: 750;
	letter-spacing: 0.09em;
	text-transform: uppercase;
	color: var(--menu-ink-muted);
}

.recommendation-list {
	display: grid;
	gap: 0.85rem;
	margin-top: 1.6rem;
}

.recommendation-card,
.all-done {
	position: relative;
	display: grid;
	gap: 0.65rem;
	min-width: 0;
	padding: 1.15rem 1.2rem;
	border: 1px solid color-mix(in oklab, var(--menu-ink) 17%, transparent);
	border-left: 4px solid var(--menu-olive);
	background: color-mix(in oklab, var(--menu-sheet) 91%, transparent);
	box-shadow: 0 10px 22px color-mix(in oklab, var(--menu-ink) 7%, transparent);
}

.recommendation-card.is-primary {
	border-left-color: var(--menu-wine);
}

.recommendation-card.is-unread {
	box-shadow:
		0 0 0 1px color-mix(in oklab, var(--menu-wine) 30%, transparent),
		0 12px 26px rgb(45 41 36 / 8%);
}

.recommendation-overline {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 0.5rem;
}

.recommendation-card h2 {
	margin: 0;
	font-family: var(--font-serif);
	font-size: clamp(1.25rem, 2.8vw, 1.75rem);
	font-weight: 380;
	line-height: 1.14;
	text-wrap: balance;
}

.recommendation-card > p,
.all-done p {
	margin: 0;
	font-size: 1rem;
	line-height: 1.62;
	color: var(--menu-ink-muted);
}

.recommendation-card a {
	display: inline-flex;
	width: fit-content;
	min-height: 44px;
	align-items: center;
	justify-content: center;
	gap: 0.35rem;
	margin-top: 0.2rem;
	padding: 0.55rem 0.8rem;
	border: 1px solid currentColor;
	color: var(--menu-wine);
	font-family: var(--font-sans);
	font-size: 0.75rem;
	font-weight: 750;
	text-decoration: none;
	transition:
		color 180ms ease,
		background-color 180ms ease,
		box-shadow 180ms ease,
		transform 180ms ease;
}

.recommendation-card a :global(svg) {
	transition: transform 180ms ease;
}

@media (hover: hover) and (pointer: fine) {
	.recommendation-card a:hover {
		color: var(--menu-sheet);
		background: var(--menu-wine);
		box-shadow: 0 6px 14px color-mix(in oklab, var(--menu-wine) 22%, transparent);
		transform: translateY(-2px);
	}

	.recommendation-card a:hover :global(svg) {
		transform: translateX(3px);
	}
}

.recommendation-card a:focus-visible,
.home-book-slot:focus-visible {
	border-radius: 0.15rem;
	outline: 2px solid var(--menu-focus);
	outline-offset: 3px;
}

.unread-mark {
	display: inline-flex;
	align-items: center;
	gap: 0.3rem;
	margin-top: 0.65rem;
	color: var(--menu-wine);
	font-size: 0.68rem;
	font-weight: 750;
}

.closed-book-zone {
	display: grid;
	justify-items: center;
	min-width: 0;
	padding-bottom: 1.5rem;
}

.closed-book-stack {
	position: relative;
	width: min(100%, 26rem);
}

.home-book-slot {
	display: block;
	width: 100%;
	aspect-ratio: var(--menu-page-aspect);
	padding: 0;
	border: 0;
	background: transparent;
	cursor: pointer;
}

.mobile-catalog-link {
	display: none;
}

.closed-ribbons {
	display: none;
	position: absolute;
	top: 22%;
	left: calc(100% - 0.9rem);
	z-index: 1;
}

.closed-ribbons :global(.ribbon[aria-selected="true"]:not(:hover) .ribbon-face) {
	transform: none;
}

.closed-ribbons :global(.ribbon:hover:not(:disabled) .ribbon-face) {
	transform: translateX(0.3rem);
}

@media (max-width: 64rem) {
	.home-grid {
		grid-template-columns: minmax(0, 1fr) minmax(18rem, 0.8fr);
		align-items: start;
		gap: 2rem;
		min-height: 0;
	}
}

@media (56.25rem <= width <= 64rem) {
	.closed-book-zone {
		/* Reserve space for tabs that now travel with the book's right edge. */
		padding-inline-end: 3.5rem;
	}
}

@media (width < 56.25rem) {
	.closed-book-zone {
		display: none;
	}
	.home-grid {
		grid-template-columns: 1fr;
		gap: 0;
		min-height: 0;
		padding-bottom: 1rem;
	}
	.mobile-catalog-link {
		display: flex;
		width: 100%;
		min-height: 44px;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		margin-top: 1rem;
		padding: 0.65rem 1rem;
		border: 1px solid color-mix(in oklab, var(--menu-wine) 35%, transparent);
		border-radius: 0.25rem;
		color: var(--menu-wine);
		font-family: var(--font-sans);
		font-size: 0.875rem;
		font-weight: 600;
		cursor: pointer;
	}
	.mobile-catalog-link:focus-visible {
		outline: 2px solid var(--menu-focus);
		outline-offset: 3px;
	}
}

@media (prefers-reduced-motion: reduce) {
	.recommendation-card a,
	.recommendation-card a :global(svg) {
		transition: none;
	}

	.recommendation-card a:hover,
	.recommendation-card a:hover :global(svg) {
		transform: none;
	}
}
</style>
