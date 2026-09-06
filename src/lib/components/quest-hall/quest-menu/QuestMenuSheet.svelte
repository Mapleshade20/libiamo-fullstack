<script lang="ts">
import ArrowLeft from "@lucide/svelte/icons/arrow-left";
import type { LanguageCode } from "$lib/constants";
import { t } from "$lib/i18n";
import { QUEST_MENU_SECTIONS, type QuestMenuCatalog, type QuestMenuItem, type QuestMenuSection } from "$lib/quest-hall/menu";
import QuestMenuItemCard from "./QuestMenuItemCard.svelte";
import QuestMenuMonthFolio from "./QuestMenuMonthFolio.svelte";

interface Props {
	sections: QuestMenuCatalog["sections"];
	section: QuestMenuSection;
	lang: LanguageCode;
	translationMonth: string;
	paperElement?: HTMLDivElement | null;
	onclose: () => void;
	onselect: (section: QuestMenuSection) => void;
	onmonthchange: (direction: -1 | 1) => void;
	onselectitem: (item: QuestMenuItem, event: MouseEvent) => void;
}

let { sections, section, lang, translationMonth, paperElement = $bindable(null), onclose, onselect, onmonthchange, onselectitem }: Props = $props();
function sectionLabel(section: QuestMenuSection): string {
	return t(lang, section === "daily" ? "hall.today" : section === "weekly" ? "hall.thisWeek" : "translate.title");
}
let tabButtons: HTMLButtonElement[] = $state([]);
function moveTab(event: KeyboardEvent, index: number): void {
	let next: number;
	if (event.key === "ArrowRight") next = (index + 1) % QUEST_MENU_SECTIONS.length;
	else if (event.key === "ArrowLeft") next = (index - 1 + QUEST_MENU_SECTIONS.length) % QUEST_MENU_SECTIONS.length;
	else if (event.key === "Home") next = 0;
	else if (event.key === "End") next = QUEST_MENU_SECTIONS.length - 1;
	else return;
	event.preventDefault();
	tabButtons[next]?.focus();
	onselect(QUEST_MENU_SECTIONS[next]);
}
</script>

<div class="mobile-book">
	<div class="mobile-toolbar">
		<button type="button" class="back-button" aria-label={t(lang, "hall.menu.close")} title={t(lang, "hall.menu.close")} onclick={onclose}>
			<ArrowLeft size={19} aria-hidden="true" />
		</button>
		<div
			class="section-tabs"
			style:--active-tab={QUEST_MENU_SECTIONS.indexOf(section)}
			role="tablist"
			aria-label={t(lang, "hall.menu.sectionTabs")}
			aria-orientation="horizontal"
		>
			{#each QUEST_MENU_SECTIONS as tab, index (tab)}
				<button
					bind:this={tabButtons[index]}
					type="button"
					role="tab"
					id={`mobile-tab-${tab}`}
					aria-controls="mobile-catalog-panel"
					aria-selected={section === tab}
					tabindex={section === tab ? 0 : -1}
					onclick={() => onselect(tab)}
					onkeydown={(event) => moveTab(event, index)}
				>
					{sectionLabel(tab)}
				</button>
			{/each}
		</div>
	</div>
	<div id="mobile-catalog-panel" class="mobile-panel" role="tabpanel" aria-labelledby={`mobile-tab-${section}`} tabindex="0" bind:this={paperElement}>
		{#if section === "translation"}
			<div class="month-navigation"><QuestMenuMonthFolio month={translationMonth} {lang} onchange={onmonthchange} /></div>
		{/if}
		<div class="mobile-task-list">
			{#each sections[section] as item (item.key)}
				<div class="mobile-paper"><QuestMenuItemCard {item} {lang} onselect={onselectitem} /></div>
			{:else}
				<div class="mobile-paper"><p class="blank-page">{t(lang, section === "translation" ? "translate.empty" : "hall.noTasks")}</p></div>
			{/each}
		</div>
	</div>
</div>

<style>
.mobile-book {
	display: none;
}

@media (width < 56.25rem) {
	.mobile-book {
		display: block;
		width: 100%;
	}
	.mobile-toolbar {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		margin-bottom: 1rem;
		font-family: var(--font-sans);
		color: var(--menu-ink);
	}
	.mobile-toolbar > .back-button {
		display: grid;
		width: 44px;
		height: 44px;
		flex: 0 0 44px;
		place-items: center;
		color: var(--menu-ink-muted);
	}
	.mobile-toolbar > .back-button:disabled {
		opacity: 0.3;
	}
	.mobile-toolbar > .back-button:focus-visible {
		outline: 2px solid var(--menu-focus);
		outline-offset: -2px;
		border-radius: 0.25rem;
	}
	.section-tabs {
		position: relative;
		display: grid;
		flex: 1;
		min-width: 0;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		border-bottom: 1px solid color-mix(in oklab, var(--menu-ink) 14%, transparent);
		font-family: var(--font-sans);
	}
	.section-tabs::after {
		content: "";
		position: absolute;
		bottom: 0;
		left: 0;
		width: calc(100% / 3);
		height: 2px;
		background: var(--menu-wine);
		transform: translateX(calc(var(--active-tab) * 100%));
		transition: transform 240ms cubic-bezier(0.22, 1, 0.36, 1);
		pointer-events: none;
	}
	.section-tabs button {
		min-width: 0;
		min-height: 44px;
		padding: 0.6rem 0.25rem;
		border-bottom: 2px solid transparent;
		font-size: 0.875rem;
		line-height: 1.3;
		font-weight: 600;
		color: var(--menu-ink-muted);
		cursor: pointer;
		transition:
			color 180ms ease,
			background-color 180ms ease;
	}
	.section-tabs button[aria-selected="true"] {
		color: var(--menu-wine);
	}
	.section-tabs button:active,
	.mobile-toolbar > .back-button:active {
		background: color-mix(in oklab, var(--menu-wine) 7%, transparent);
	}
	.section-tabs button:focus-visible,
	.mobile-panel:focus-visible {
		outline: 2px solid var(--menu-focus);
		outline-offset: -2px;
	}
	.month-navigation {
		display: flex;
		justify-content: flex-end;
		margin-bottom: 0.75rem;
	}
	.mobile-task-list {
		display: grid;
		gap: 0.75rem;
	}
	.mobile-paper {
		padding: 1rem;
		border: 1px solid color-mix(in oklab, var(--menu-ink) 12%, transparent);
		border-radius: 0.5rem;
		background: var(--menu-sheet);
		transition:
			border-color 180ms ease,
			box-shadow 180ms ease;
	}
	.mobile-paper:focus-within {
		border-color: color-mix(in oklab, var(--menu-wine) 40%, transparent);
	}
	.mobile-paper :global(.task-card) {
		min-height: 0;
		padding: 0;
		border: 0;
		gap: 0.65rem;
	}
	.mobile-paper :global(.task-overline > span:first-child) {
		display: none;
	}
	.mobile-paper :global(.task-card h3) {
		font-size: clamp(1.4rem, 6vw, 1.8rem);
		text-wrap: pretty;
	}
	.mobile-paper :global(.task-card .meta) {
		margin-top: 0.5rem;
	}
	.blank-page {
		padding: 1.5rem 0;
		color: var(--menu-ink-muted);
		font-family: var(--font-sans);
		text-align: center;
	}
}

@media (hover: hover) and (pointer: fine) {
	.mobile-paper:hover {
		border-color: color-mix(in oklab, var(--menu-wine) 30%, transparent);
		box-shadow: 0 3px 12px color-mix(in oklab, var(--menu-ink) 5%, transparent);
	}
}

@media (prefers-reduced-motion: reduce) {
	.section-tabs::after,
	.section-tabs button,
	.mobile-paper {
		transition: none;
	}
}
</style>
