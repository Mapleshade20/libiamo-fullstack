<script lang="ts">
import ArrowLeft from "@lucide/svelte/icons/arrow-left";
import ChevronLeft from "@lucide/svelte/icons/chevron-left";
import ChevronRight from "@lucide/svelte/icons/chevron-right";
import { type LanguageCode, t } from "$lib/i18n";
import { formatCalendarMonth } from "$lib/month";
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
			{#if section === "translation"}
				<div class="month-press" aria-label={t(lang, "translate.month")}>
					<button
						type="button"
						aria-label={t(lang, "translate.previousMonth")}
						title={t(lang, "translate.previousMonth")}
						onclick={() => onmonthchange(-1)}
					>
						<ChevronLeft size={17} aria-hidden="true" />
					</button>
					<span aria-live="polite">{formatCalendarMonth(translationMonth, lang)}</span>
					<button type="button" aria-label={t(lang, "translate.nextMonth")} title={t(lang, "translate.nextMonth")} onclick={() => onmonthchange(1)}>
						<ChevronRight size={17} aria-hidden="true" />
					</button>
				</div>
			{/if}
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
		bind:paperElement
		{onselect}
		{onmove}
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

.month-press {
	display: grid;
	width: min(19rem, 100%);
	grid-template-columns: 2.75rem minmax(0, 1fr) 2.75rem;
	align-items: stretch;
	margin: 0.75rem auto 0;
	border: 1px solid color-mix(in oklab, var(--menu-ink) 22%, transparent);
	background: color-mix(in oklab, var(--menu-sheet) 80%, transparent);
	box-shadow: 0 2px 0 color-mix(in oklab, var(--menu-ink) 10%, transparent);
	font-family: var(--font-sans);
}

.month-press button {
	display: grid;
	min-width: 44px;
	min-height: 44px;
	place-items: center;
	color: var(--menu-ink-muted);
	transition:
		background-color 160ms ease,
		color 160ms ease;
}

.month-press button:hover {
	background: color-mix(in oklab, var(--menu-blue) 10%, transparent);
	color: var(--menu-blue);
}

.month-press button:focus-visible {
	outline: 2px solid var(--menu-focus);
	outline-offset: -3px;
}

.month-press span {
	display: grid;
	place-items: center;
	border-inline: 1px solid color-mix(in oklab, var(--menu-ink) 18%, transparent);
	padding: 0.55rem 0.75rem;
	font-size: 0.68rem;
	font-weight: 750;
	letter-spacing: 0.07em;
	line-height: 1.2;
	text-transform: uppercase;
	color: var(--menu-ink);
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

@media (max-width: 64rem) {
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

	.month-press {
		width: 100%;
		margin-top: 0.65rem;
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
