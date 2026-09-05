<script lang="ts">
import ArrowLeft from "@lucide/svelte/icons/arrow-left";
import type { LanguageCode } from "$lib/constants";
import { t } from "$lib/i18n";
import type { QuestMenuItem, QuestMenuSection } from "$lib/quest-hall/menu";
import QuestMenuRibbonTabs, { type QuestMenuRibbon } from "./QuestMenuRibbonTabs.svelte";
import QuestMenuSheet from "./QuestMenuSheet.svelte";

interface Props {
	visible: boolean;
	interactive: boolean;
	section: QuestMenuSection;
	sectionLabel: string;
	folio: { current: number; total: number };
	item: QuestMenuItem | null;
	itemCount: number;
	translationMonth: string;
	ribbons: QuestMenuRibbon[];
	canMovePrevious: boolean;
	canMoveNext: boolean;
	lang: LanguageCode;
	catalogSlot?: HTMLDivElement | null;
	paperElement?: HTMLDivElement | null;
	stageElement?: HTMLElement | null;
	onclose: () => void;
	onselect: (section: QuestMenuSection) => void;
	onmove: (direction: -1 | 1) => void;
	onmonthchange: (direction: -1 | 1) => void;
	onselectitem: (item: QuestMenuItem, event: MouseEvent) => void;
}

let {
	visible,
	interactive,
	section,
	sectionLabel,
	folio,
	item,
	itemCount,
	translationMonth,
	ribbons,
	canMovePrevious,
	canMoveNext,
	lang,
	catalogSlot = $bindable(null),
	paperElement = $bindable(null),
	stageElement = $bindable(null),
	onclose,
	onselect,
	onmove,
	onmonthchange,
	onselectitem,
}: Props = $props();
</script>

<section
	bind:this={stageElement}
	class="catalog-stage"
	id="quest-menu-catalog"
	aria-labelledby="quest-menu-catalog-title"
	aria-hidden={!visible}
	inert={!interactive}
>
	<div class="catalog-toolbar">
		<button type="button" class="quiet-button" onclick={onclose}><ArrowLeft size={17} aria-hidden="true" /> {t(lang, "hall.menu.close")}</button>
		<div>
			<p>{sectionLabel}</p>
			<h2 id="quest-menu-catalog-title">{t(lang, "hall.menu.chooseMission")}</h2>
		</div>
		<span>{t(lang, "hall.menu.folio")} {folio.current} / {folio.total}</span>
	</div>

	<div class="catalog-book-stage">
		<div bind:this={catalogSlot} class="catalog-slot" aria-hidden="true"></div>
		<div class="catalog-ribbons"><QuestMenuRibbonTabs tabs={ribbons} value={section} label={t(lang, "hall.menu.sectionTabs")} {onselect} /></div>
	</div>

	<QuestMenuSheet
		{item}
		{itemCount}
		{section}
		{sectionLabel}
		folio={folio.current}
		{ribbons}
		{canMovePrevious}
		{canMoveNext}
		{lang}
		{translationMonth}
		bind:paperElement
		{onselect}
		{onmove}
		{onmonthchange}
		{onselectitem}
	/>
</section>

<style>
.catalog-stage {
	grid-area: 1 / 1;
}

.catalog-stage[aria-hidden="true"] {
	visibility: hidden;
	opacity: 0;
	pointer-events: none;
}

.catalog-toolbar {
	display: grid;
	grid-template-columns: minmax(9rem, 1fr) auto minmax(9rem, 1fr);
	align-items: center;
	gap: 1rem;
	max-width: 74rem;
	margin: 0 auto 1rem;
	text-align: center;
}

.catalog-toolbar p {
	font-family: var(--font-sans);
	font-size: 0.68rem;
	font-weight: 750;
	letter-spacing: 0.13em;
	text-transform: uppercase;
	color: var(--menu-wine);
}

.catalog-toolbar h2 {
	margin: 0.35rem 0 0;
	font-family: "Newsreader", var(--font-serif);
	font-size: clamp(1.45rem, 3vw, 2.25rem);
	font-weight: 380;
	line-height: 1.08;
}

.quiet-button {
	display: inline-flex;
	min-height: 44px;
	align-items: center;
	gap: 0.35rem;
	justify-self: start;
	padding: 0.5rem 0.75rem;
	border: 1px solid color-mix(in oklab, var(--menu-ink) 23%, transparent);
	background: transparent;
	color: var(--menu-ink-muted);
	font-family: var(--font-sans);
	font-size: 0.75rem;
	font-weight: 750;
}

.quiet-button:focus-visible {
	border-radius: 0.15rem;
	outline: 2px solid var(--menu-focus);
	outline-offset: 3px;
}

.catalog-toolbar > span {
	justify-self: end;
	font-family: var(--font-sans);
	font-size: 0.72rem;
	font-weight: 700;
	letter-spacing: 0.08em;
	text-transform: uppercase;
	color: var(--menu-ink-muted);
}

.catalog-book-stage {
	--menu-stage-gutter: 3.25rem;
	--ribbon-tab-width: 4.3rem;
	--ribbon-tab-offset: -0.15rem;
	--menu-leaf-bleed: 0.25rem;
	position: relative;
	max-width: 74rem;
	margin: 0 auto;
	padding: 1.5rem var(--menu-stage-gutter) 1.5rem 2.5rem;
}

.catalog-slot {
	width: 100%;
	aspect-ratio: var(--menu-spread-aspect);
}

.catalog-ribbons {
	position: absolute;
	top: 24%;
	right: var(--ribbon-tab-offset);
	z-index: 5;
	clip-path: inset(
		-1rem calc(-1 * var(--menu-ribbon-reach) - 0.75rem) -1rem
			calc(var(--ribbon-tab-width) + var(--ribbon-tab-offset) - var(--menu-stage-gutter) + var(--menu-leaf-bleed))
	);
	filter: drop-shadow(7px 5px 7px color-mix(in oklab, var(--menu-ink) 14%, transparent));
}

.catalog-ribbons :global(.ribbon[aria-selected="true"] .ribbon-face) {
	transform: translateX(var(--menu-ribbon-reach));
}

.catalog-ribbons :global(.ribbon:hover:not([aria-selected="true"]) .ribbon-face) {
	transform: translateX(0.3rem);
}

@media (max-width: 44rem) {
	.catalog-book-stage {
		display: none;
	}
}

@media (max-width: 44rem) {
	.catalog-toolbar {
		grid-template-columns: 1fr auto;
		text-align: left;
	}

	.catalog-toolbar > div {
		grid-column: 1 / -1;
		grid-row: 1;
	}

	.catalog-toolbar .quiet-button {
		grid-column: 1;
		grid-row: 2;
	}

	.catalog-toolbar > span {
		grid-column: 2;
		grid-row: 2;
	}
}
</style>
