<script lang="ts">
import ChevronLeft from "@lucide/svelte/icons/chevron-left";
import ChevronRight from "@lucide/svelte/icons/chevron-right";
import Wine from "@lucide/svelte/icons/wine";
import { type LanguageCode, t } from "$lib/i18n";
import type { QuestMenuItem, QuestMenuSection } from "$lib/quest-hall/menu";
import QuestMenuItemCard from "./QuestMenuItemCard.svelte";
import QuestMenuRibbonTabs, { type QuestMenuRibbon } from "./QuestMenuRibbonTabs.svelte";

interface Props {
	item: QuestMenuItem | null;
	itemCount: number;
	section: QuestMenuSection;
	sectionLabel: string;
	folio: number;
	ribbons: QuestMenuRibbon[];
	canMovePrevious: boolean;
	canMoveNext: boolean;
	lang: LanguageCode;
	paperElement?: HTMLDivElement | null;
	onselect: (section: QuestMenuSection) => void;
	onmove: (direction: -1 | 1) => void;
	onselectitem: (item: QuestMenuItem, event: MouseEvent) => void;
}

let {
	item,
	itemCount,
	section,
	sectionLabel,
	folio,
	ribbons,
	canMovePrevious,
	canMoveNext,
	lang,
	paperElement = $bindable(null),
	onselect,
	onmove,
	onselectitem,
}: Props = $props();
</script>

<div class="mobile-book">
	<div class="mobile-navigation" aria-label={t(lang, "hall.menu.mobileNavigation")}>
		<button type="button" disabled={!canMovePrevious} aria-label={t(lang, "hall.menu.previous")} onclick={() => onmove(-1)}>
			<ChevronLeft size={20} />
		</button>
		<span>{item ? `${item.ordinal} / ${itemCount}` : t(lang, "hall.menu.noMission")}</span>
		<button type="button" disabled={!canMoveNext} aria-label={t(lang, "hall.menu.next")} onclick={() => onmove(1)}><ChevronRight size={20} /></button>
	</div>
	<div class="mobile-page-stage">
		<div class="mobile-ribbons"><QuestMenuRibbonTabs tabs={ribbons} value={section} label={t(lang, "hall.menu.sectionTabs")} {onselect} /></div>
		<span class="stack-sheet stack-sheet-back"></span>
		<span class="stack-sheet stack-sheet-middle"></span>
		<div class="mobile-paper" bind:this={paperElement}>
			<p class="page-folio"><Wine size={14} /> {sectionLabel} · {t(lang, "hall.menu.folio")} {folio}</p>
			{#if item}
				<QuestMenuItemCard {item} {lang} onselect={onselectitem} />
			{:else}
				<p class="blank-page">{t(lang, "hall.noTasks")}</p>
			{/if}
		</div>
	</div>
</div>

<style>
.mobile-book {
	display: none;
}

@media (max-width: 64rem) {
	.mobile-book {
		--mobile-tab-gutter: clamp(2.0625rem, 9vw, 2.375rem);
		display: block;
		max-width: 30rem;
		margin-inline: auto;
	}

	.mobile-navigation {
		display: grid;
		grid-template-columns: 3rem 1fr 3rem;
		align-items: center;
		gap: 0.75rem;
		margin: 0 var(--mobile-tab-gutter) 0.75rem 0;
		text-align: center;
		font-size: 0.72rem;
		font-weight: 700;
		color: var(--menu-ink-muted);
	}

	.mobile-navigation button {
		display: grid;
		width: 44px;
		height: 44px;
		place-items: center;
		color: var(--menu-wine);
	}

	.mobile-navigation button:focus-visible {
		border-radius: 0.15rem;
		outline: 2px solid var(--menu-focus);
		outline-offset: 3px;
	}

	.mobile-navigation button:disabled {
		opacity: 0.3;
	}

	.mobile-page-stage {
		position: relative;
		padding-right: var(--mobile-tab-gutter);
		padding-bottom: 0.8rem;
		isolation: isolate;
	}

	.mobile-ribbons {
		position: absolute;
		top: 3.5rem;
		right: -1rem;
		z-index: 3;
		will-change: transform, opacity;
	}

	.mobile-ribbons :global(.ribbon) {
		width: 3.75rem;
		min-width: 3.75rem;
	}

	.mobile-paper,
	.stack-sheet {
		border: 1px solid color-mix(in oklab, var(--menu-ink) 15%, transparent);
		background: var(--menu-sheet);
		box-shadow: 0 12px 24px rgb(45 41 36 / 8%);
	}

	.mobile-paper {
		position: relative;
		z-index: 4;
		display: flex;
		min-height: clamp(31rem, 64dvh, 38rem);
		flex-direction: column;
		padding: 1.2rem;
		will-change: transform, opacity;
	}

	.mobile-paper :global(.task-card) {
		min-height: clamp(27rem, 56dvh, 34rem);
		padding: 0.75rem 0;
	}

	.mobile-paper :global(.task-card h3) {
		font-size: clamp(1.5rem, 8vw, 2.35rem);
	}

	.stack-sheet {
		position: absolute;
		inset: 0 var(--mobile-tab-gutter) 0.8rem 0;
	}

	.stack-sheet-back {
		z-index: 1;
		transform: translateY(0.75rem) scaleX(0.94) rotate(-0.45deg);
	}

	.stack-sheet-middle {
		z-index: 2;
		transform: translateY(0.4rem) scaleX(0.975) rotate(0.28deg);
	}

	.page-folio {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		margin-bottom: 0.8rem;
		font-family: var(--font-sans);
		font-size: 0.64rem;
		font-weight: 750;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--menu-ink-muted);
	}

	.blank-page {
		display: grid;
		flex: 1;
		place-items: center;
		color: color-mix(in oklab, var(--menu-ink) 38%, transparent);
	}
}
</style>
