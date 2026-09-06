<script lang="ts">
import ChevronLeft from "@lucide/svelte/icons/chevron-left";
import ChevronRight from "@lucide/svelte/icons/chevron-right";
import Wine from "@lucide/svelte/icons/wine";
import type { LanguageCode } from "$lib/constants";
import { t } from "$lib/i18n";
import type { QuestMenuItem, QuestMenuSection, QuestMenuSpread } from "$lib/quest-hall/menu";
import QuestMenuCoverEmblem from "./QuestMenuCoverEmblem.svelte";
import QuestMenuItemCard from "./QuestMenuItemCard.svelte";
import QuestMenuMonthFolio from "./QuestMenuMonthFolio.svelte";
import QuestMenuRibbonTabs, { type QuestMenuRibbon } from "./QuestMenuRibbonTabs.svelte";

export interface QuestMenuTurnPreview {
	direction: -1 | 1;
	fromSection: QuestMenuSection;
	toSection: QuestMenuSection;
	fromSpread: QuestMenuSpread;
	toSpread: QuestMenuSpread;
	fromFolio: number;
	toFolio: number;
}

interface Props {
	ready: boolean;
	revealed: boolean;
	onrevealed: () => void;
	renderPages: boolean;
	interactive: boolean;
	ribbons: QuestMenuRibbon[];
	view: "home" | "catalog" | "prepare";
	section: QuestMenuSection;
	spread: QuestMenuSpread;
	turnPreview: QuestMenuTurnPreview | null;
	folio: number;
	unreadCount: number;
	canTurnPrevious: boolean;
	canTurnNext: boolean;
	turning: boolean;
	lang: LanguageCode;
	translationMonth: string;
	bookFrame?: HTMLDivElement | null;
	bookTilt?: HTMLDivElement | null;
	rectoProbe?: HTMLSpanElement | null;
	bookShadow?: HTMLSpanElement | null;
	leftHalf?: HTMLDivElement | null;
	cover?: HTMLDivElement | null;
	turnControls?: HTMLDivElement | null;
	turnSheet?: HTMLDivElement | null;
	onturn: (direction: -1 | 1) => void;
	onmonthchange: (direction: -1 | 1) => void;
	onselectsection: (section: QuestMenuSection) => void;
	onselectitem: (item: QuestMenuItem, event: MouseEvent) => void;
}

let {
	ready,
	revealed,
	onrevealed,
	renderPages,
	interactive,
	ribbons,
	view,
	section,
	spread,
	turnPreview,
	folio,
	unreadCount,
	canTurnPrevious,
	canTurnNext,
	turning,
	lang,
	translationMonth,
	bookFrame = $bindable(null),
	bookTilt = $bindable(null),
	rectoProbe = $bindable(null),
	bookShadow = $bindable(null),
	leftHalf = $bindable(null),
	cover = $bindable(null),
	turnControls = $bindable(null),
	turnSheet = $bindable(null),
	onturn,
	onmonthchange,
	onselectsection,
	onselectitem,
}: Props = $props();

let staticLeftSection = $derived(!turnPreview ? section : turnPreview.direction > 0 ? turnPreview.fromSection : turnPreview.toSection);
let staticRightSection = $derived(!turnPreview ? section : turnPreview.direction > 0 ? turnPreview.toSection : turnPreview.fromSection);
let staticLeftSpread = $derived(!turnPreview ? spread : turnPreview.direction > 0 ? turnPreview.fromSpread : turnPreview.toSpread);
let staticRightSpread = $derived(!turnPreview ? spread : turnPreview.direction > 0 ? turnPreview.toSpread : turnPreview.fromSpread);
let staticLeftFolio = $derived(!turnPreview ? folio : turnPreview.direction > 0 ? turnPreview.fromFolio : turnPreview.toFolio);
let staticRightFolio = $derived(!turnPreview ? folio : turnPreview.direction > 0 ? turnPreview.toFolio : turnPreview.fromFolio);

function pageNumber(pageFolio: number, side: "left" | "right"): string {
	return String(pageFolio * 2 - (side === "left" ? 1 : 0)).padStart(2, "0");
}

function sectionLabel(value: QuestMenuSection): string {
	if (value === "daily") return t(lang, "hall.today");
	if (value === "weekly") return t(lang, "hall.thisWeek");
	return t(lang, "translate.title");
}
</script>

{#snippet pageContents(pageSection: QuestMenuSection, pageSpread: QuestMenuSpread, pageFolio: number, side: "left" | "right", showMonthFolio = false)}
	<div class="page-folio" class:page-folio-right={side === "right"}>
		{#if side === "left"}
			<span class="page-wine-mark" aria-hidden="true"><Wine size={15} strokeWidth={1.4} /></span>
			<span>{sectionLabel(pageSection)} · {pageNumber(pageFolio, side)}</span>
		{:else}
			<span>{pageNumber(pageFolio, side)} · {t(lang, "hall.menu.brand")}</span>
			<span class="page-wine-mark" aria-hidden="true"><Wine size={15} strokeWidth={1.4} /></span>
		{/if}
		{#if pageSection === "translation" && side === "left" && showMonthFolio}
			<QuestMenuMonthFolio month={translationMonth} {lang} disabled={turning} onchange={onmonthchange} />
		{/if}
	</div>
	<div class="page-items" class:is-compact={side === "right" || pageSpread.leaf > 1}>
		{#each (side === "left" ? pageSpread.leftItems : pageSpread.rightItems) as item (item.key)}
			<QuestMenuItemCard {item} {lang} compact={side === "right" || pageSpread.leaf > 1} onselect={onselectitem} />
		{:else}
			<p class="blank-page">{t(lang, pageSection === "translation" ? "translate.empty" : "hall.noTasks")}</p>
		{/each}
	</div>
{/snippet}

{#snippet pageCopy(pageSection: QuestMenuSection, pageSpread: QuestMenuSpread, pageFolio: number, side: "left" | "right")}
	<div class="page-copy" class:is-left-copy={side === "left"} class:is-right-copy={side === "right"}>
		{@render pageContents(pageSection, pageSpread, pageFolio, side)}
	</div>
{/snippet}

<div
	class="book-layer"
	class:is-ready={ready}
	class:is-revealing={ready && !revealed}
	class:is-prepare={view === "prepare"}
	class:is-home={view === "home"}
	aria-hidden={!ready || view === "prepare"}
	inert={!ready || !interactive || view === "prepare"}
>
	<div class="book-frame-shell" onanimationend={(event) => { if (event.target === event.currentTarget) onrevealed(); }}>
		<div class="book-frame" bind:this={bookFrame} aria-busy={turning}>
			<span class="recto-probe" bind:this={rectoProbe} aria-hidden="true"></span>
			<div class="book-tilt" bind:this={bookTilt}>
				<div class="book-solid">
					<span class="book-shadow" bind:this={bookShadow} aria-hidden="true"></span>
					<div class="book-ribbons">
						<QuestMenuRibbonTabs tabs={ribbons} value={section} label={t(lang, "hall.menu.sectionTabs")} onselect={onselectsection} />
					</div>

					<div class="book-half book-half-left" bind:this={leftHalf} aria-hidden="true">
						<span class="book-surface book-deck book-deck-blank"></span>
						<span class="book-surface book-edge book-edge-fore"></span>
						<span class="book-surface book-edge book-edge-head"></span>
						<span class="book-surface book-edge book-edge-tail"></span>
						<span class="book-surface book-board book-board-base"></span>
					</div>

					<div class="book-half book-half-right" aria-hidden={view !== "catalog"} inert={view !== "catalog"}>
						<span class="book-edge book-edge-fore" aria-hidden="true"></span>
						<span class="book-edge book-edge-head" aria-hidden="true"></span>
						<span class="book-edge book-edge-tail" aria-hidden="true"></span>
						<span class="book-edge book-edge-spine" aria-hidden="true"></span>
						<span class="book-board book-board-base" aria-hidden="true"></span>
						<div class="page page-right">
							{#if renderPages}
								{@render pageContents(staticRightSection, staticRightSpread, staticRightFolio, "right")}
							{/if}
						</div>
					</div>

					<div class="turn-controls" bind:this={turnControls} aria-hidden={view !== "catalog"} inert={view !== "catalog"}>
						<button
							type="button"
							class="turn-button turn-previous"
							disabled={!canTurnPrevious || turning}
							aria-label={t(lang, "hall.menu.previous")}
							onclick={() => onturn(-1)}
						>
							<span class="turn-cue" aria-hidden="true"><ChevronLeft size={22} strokeWidth={1.35} /></span>
						</button>
						<button
							type="button"
							class="turn-button turn-next"
							disabled={!canTurnNext || turning}
							aria-label={t(lang, "hall.menu.next")}
							onclick={() => onturn(1)}
						>
							<span class="turn-cue" aria-hidden="true"><ChevronRight size={22} strokeWidth={1.35} /></span>
						</button>
					</div>

					<div class="turn-hinge" aria-hidden="true">
						<div class="turn-sheet" bind:this={turnSheet}>
							<div class="turn-sheet-face turn-sheet-front">
								{#if turnPreview}
									{@render pageCopy(turnPreview.fromSection, turnPreview.fromSpread, turnPreview.fromFolio, turnPreview.direction > 0 ? "right" : "left")}
								{/if}
								<span class="turn-sheet-shade"></span>
							</div>
							<div class="turn-sheet-face turn-sheet-back">
								{#if turnPreview}
									{@render pageCopy(turnPreview.toSection, turnPreview.toSpread, turnPreview.toFolio, turnPreview.direction > 0 ? "left" : "right")}
								{/if}
								<span class="turn-sheet-shade"></span>
							</div>
						</div>
					</div>

					<div class="cover-hinge">
						<div class="book-cover" bind:this={cover}>
							<span class="cover-face cover-face-front" aria-hidden="true">
								<span class="cover-depth"></span>
								<span class="cover-rule"></span>
								<strong>{t(lang, "hall.menu.brand")}</strong>
								<QuestMenuCoverEmblem {unreadCount} />
								<span class="cover-rule cover-rule-bottom"></span>
								<span class="cover-sheen"><span class="cover-gloss"></span><span class="cover-shade"></span></span>
							</span>
							<div class="cover-face cover-face-back page page-left" aria-hidden={view !== "catalog"} inert={view !== "catalog"}>
								{#if renderPages}
									{@render pageContents(staticLeftSection, staticLeftSpread, staticLeftFolio, "left", !turnPreview)}
								{/if}
							</div>
							<span class="book-edge book-edge-board book-edge-fore" aria-hidden="true"></span>
							<span class="book-edge book-edge-board book-edge-head" aria-hidden="true"></span>
							<span class="book-edge book-edge-board book-edge-tail" aria-hidden="true"></span>
							<span class="book-edge book-edge-board book-edge-spine" aria-hidden="true"></span>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>
</div>

<style>
.book-layer {
	position: absolute;
	inset: 0;
	z-index: 3;
	pointer-events: none;
}

.book-layer:not(.is-ready) {
	visibility: hidden;
}

.book-frame-shell {
	max-width: 74rem;
	margin: 0 auto;
	padding: 1.5rem 3.25rem 1.5rem 2.5rem;
	perspective: clamp(2600px, 220vw, 4200px);
	perspective-origin: 50% 42%;
}

.book-layer:not(.is-ready) .book-frame-shell {
	opacity: 0;
}

.book-layer.is-revealing .book-frame-shell {
	/* Composite the complete book together, including its cover, lettering,
	   lighting and shadow. Leave the inner preserve-3d transforms untouched. */
	animation: book-reveal 200ms ease-out both;
}

@keyframes book-reveal {
	from {
		opacity: 0;
	}
	to {
		opacity: 1;
	}
}

@media (prefers-reduced-motion: reduce) {
	.book-layer.is-revealing .book-frame-shell {
		animation: none;
	}
}

.book-frame {
	--book-depth: 26px;
	--cover-depth: 6px;
	--leaf-depth: calc(var(--book-depth) - var(--cover-depth));
	position: relative;
	width: 100%;
	aspect-ratio: 1.48;
	transform-style: preserve-3d;
	will-change: transform;
}

.recto-probe {
	position: absolute;
	inset: 0 0 0 50%;
	visibility: hidden;
	pointer-events: none;
}

.book-tilt,
.book-solid {
	position: absolute;
	inset: 0;
	transform-style: preserve-3d;
}

.book-tilt {
	transform-origin: 75% 50%;
	will-change: transform;
}

.book-ribbons {
	position: absolute;
	top: 22%;
	left: calc(100% - 0.9rem);
	/* Share the book's fit, sway and reveal. Sit above the page-turn hit area
	   but below the closed cover, with the tucked-in ends clipped at the edge. */
	transform: translateZ(calc(var(--book-depth) + 3px));
	clip-path: inset(-1rem -1rem -1rem 0.95rem);
	filter: drop-shadow(7px 5px 7px color-mix(in oklab, var(--menu-ink) 14%, transparent));
	backface-visibility: hidden;
	pointer-events: auto;
}

.book-ribbons :global(.ribbon[aria-selected="true"] .ribbon-face) {
	transform: translateX(var(--menu-ribbon-reach));
}

.book-ribbons :global(.ribbon-label) {
	/* Remain readable when the entire closed book is fitted down. */
	font-size: 0.75rem;
}

.book-ribbons :global(.ribbon:hover:not([aria-selected="true"]) .ribbon-face) {
	transform: translateX(0.3rem);
}

.book-layer.is-home .book-ribbons :global(.ribbon[aria-selected="true"]:not(:hover) .ribbon-face) {
	transform: none;
}

.book-shadow {
	position: absolute;
	right: 0;
	bottom: -3.5%;
	left: 0;
	height: 17%;
	border-radius: 50%;
	background: radial-gradient(
		ellipse at center,
		color-mix(in oklab, var(--menu-ink) 28%, transparent) 0%,
		color-mix(in oklab, var(--menu-ink) 13%, transparent) 46%,
		transparent 76%
	);
	filter: blur(16px);
	transform-origin: right center;
	pointer-events: none;
}

.book-half {
	position: absolute;
	top: 0;
	bottom: 0;
	width: 50%;
	transform-style: preserve-3d;
}

.book-half-right {
	--edge-depth: var(--book-depth);
	right: 0;
}

.book-half-left {
	--edge-depth: var(--leaf-depth);
	left: 0;
}

.book-deck,
.book-board,
.book-edge {
	position: absolute;
	backface-visibility: hidden;
	-webkit-backface-visibility: hidden;
	pointer-events: none;
}

.book-deck {
	inset: 0;
	border: 1px solid color-mix(in oklab, var(--menu-ink) 16%, transparent);
	transform: translateZ(var(--edge-depth));
}

.book-deck-blank {
	border-right: 0;
	background: linear-gradient(90deg, var(--menu-sheet), color-mix(in oklab, var(--menu-paper) 92%, var(--menu-ink)));
}

.book-board-base {
	inset: 0;
	border: 1px solid color-mix(in oklab, var(--menu-brass) 45%, transparent);
	background: linear-gradient(115deg, color-mix(in oklab, white 8%, transparent), transparent 30%), var(--menu-cover);
	transform: rotateY(180deg);
}

.book-edge {
	background:
		linear-gradient(90deg, color-mix(in oklab, var(--menu-ink) 15%, transparent), transparent 42%),
		repeating-linear-gradient(0deg, #cec3b2 0 1px, #faf4e9 1px 3px);
}

.book-edge-fore {
	top: 0;
	right: 0;
	width: var(--edge-depth);
	height: 100%;
	transform-origin: right center;
	transform: rotateY(90deg);
}

.book-edge-spine {
	top: 0;
	left: 0;
	width: var(--edge-depth);
	height: 100%;
	background: linear-gradient(90deg, #55232c, #773440);
	transform-origin: left center;
	transform: rotateY(-90deg);
}

.book-edge-head {
	top: 0;
	right: 0;
	left: 0;
	height: var(--edge-depth);
	background:
		linear-gradient(0deg, color-mix(in oklab, var(--menu-ink) 15%, transparent), transparent 42%),
		repeating-linear-gradient(90deg, #cec3b2 0 1px, #faf4e9 1px 3px);
	transform-origin: center top;
	transform: rotateX(90deg);
}

.book-edge-tail {
	right: 0;
	bottom: 0;
	left: 0;
	height: var(--edge-depth);
	background:
		linear-gradient(180deg, color-mix(in oklab, var(--menu-ink) 15%, transparent), transparent 42%),
		repeating-linear-gradient(90deg, #cec3b2 0 1px, #faf4e9 1px 3px);
	transform-origin: center bottom;
	transform: rotateX(-90deg);
}

.book-edge-board {
	background: linear-gradient(135deg, color-mix(in oklab, var(--menu-cover) 88%, black), color-mix(in oklab, var(--menu-cover) 68%, black));
}

.page,
.page-copy {
	position: absolute;
	inset: 0;
	display: flex;
	min-width: 0;
	flex-direction: column;
	padding: clamp(1.75rem, 8%, 3rem);
	overflow: hidden;
	backface-visibility: hidden;
	-webkit-backface-visibility: hidden;
}

.page {
	border: 1px solid color-mix(in oklab, var(--menu-ink) 16%, transparent);
	pointer-events: auto;
}

.page-left,
.page-copy.is-left-copy {
	border-right: 0;
	background: linear-gradient(90deg, var(--menu-sheet), color-mix(in oklab, var(--menu-paper) 92%, var(--menu-ink)));
}

.page-right,
.page-copy.is-right-copy {
	border-left: 0;
	background: linear-gradient(90deg, color-mix(in oklab, var(--menu-paper) 92%, var(--menu-ink)), var(--menu-sheet));
}

.page-right {
	transform: translateZ(var(--book-depth));
}

.page > *,
.page-copy > * {
	position: relative;
	z-index: 2;
}

.page-folio {
	display: flex;
	align-items: center;
	gap: 0.45rem;
	margin: 0 0 0.85rem;
	font-family: var(--font-sans);
	font-size: 0.62rem;
	font-weight: 750;
	letter-spacing: 0.12em;
	text-transform: uppercase;
	color: var(--menu-ink-muted);
}

.page-folio-right {
	justify-content: flex-end;
}

.page-wine-mark {
	display: inline-grid;
	flex: 0 0 auto;
	place-items: center;
	color: color-mix(in oklab, var(--menu-wine) 76%, var(--menu-brass-dark));
	opacity: 0.82;
}

.page-items {
	display: flex;
	flex: 1;
	min-height: 0;
	gap: 0.45rem;
}

.page-items.is-compact {
	display: grid;
	grid-template-rows: repeat(2, minmax(0, 1fr));
}

.blank-page {
	display: grid;
	flex: 1;
	place-items: center;
	color: color-mix(in oklab, var(--menu-ink) 38%, transparent);
}

.turn-controls {
	position: absolute;
	inset: 0;
	transform: translateZ(calc(var(--book-depth) + 2px));
	pointer-events: none;
}

.turn-button {
	--turn-reach: 1.8rem;
	--turn-cue-inset: 0.35rem;
	position: absolute;
	top: 0;
	bottom: 0;
	z-index: 1;
	width: calc(var(--turn-cue-inset) + var(--turn-reach) * 2);
	padding: 0;
	border: 0;
	background: transparent;
	color: var(--menu-wine);
	cursor: pointer;
	pointer-events: auto;
	touch-action: manipulation;
}

.turn-previous {
	left: calc(-1 * var(--turn-reach));
}

.turn-next {
	right: calc(-1 * var(--turn-reach));
}

.turn-button::before {
	position: absolute;
	top: 0;
	bottom: 0;
	content: "";
	opacity: 0;
	pointer-events: none;
	transition: opacity 160ms ease;
}

.turn-previous::before {
	right: -7rem;
	left: var(--turn-reach);
	background: linear-gradient(90deg, color-mix(in oklab, var(--menu-wine) 7%, transparent), transparent 24%);
}

.turn-next::before {
	right: var(--turn-reach);
	left: -7rem;
	background: linear-gradient(270deg, color-mix(in oklab, var(--menu-wine) 7%, transparent), transparent 24%);
}

.turn-cue {
	position: absolute;
	top: 50%;
	display: grid;
	width: var(--turn-reach);
	height: 3rem;
	place-items: center;
	border: 1px solid transparent;
	background: color-mix(in oklab, var(--menu-sheet) 72%, transparent);
	opacity: 0.28;
	transform: translateY(-50%);
	transition:
		opacity 160ms ease,
		transform 160ms cubic-bezier(0.22, 1, 0.36, 1),
		border-color 160ms ease,
		background-color 160ms ease;
}

.turn-previous .turn-cue {
	left: calc(var(--turn-reach) + var(--turn-cue-inset));
}

.turn-next .turn-cue {
	right: calc(var(--turn-reach) + var(--turn-cue-inset));
}

.turn-button:focus-visible {
	outline: 0;
}

.turn-button:not(:disabled):hover::before,
.turn-button:focus-visible::before {
	opacity: 1;
}

.turn-button:not(:disabled):hover .turn-cue,
.turn-button:focus-visible .turn-cue {
	border-color: color-mix(in oklab, var(--menu-wine) 42%, transparent);
	background: color-mix(in oklab, var(--menu-sheet) 94%, var(--menu-paper));
	opacity: 0.9;
}

.turn-previous:not(:disabled):hover .turn-cue,
.turn-previous:focus-visible .turn-cue {
	transform: translate(-0.12rem, -50%);
}

.turn-next:not(:disabled):hover .turn-cue,
.turn-next:focus-visible .turn-cue {
	transform: translate(0.12rem, -50%);
}

.turn-button:focus-visible .turn-cue {
	box-shadow: 0 0 0 2px var(--menu-focus);
}

.turn-button:disabled {
	cursor: default;
	pointer-events: none;
}

.turn-button:disabled .turn-cue {
	opacity: 0;
}

.turn-hinge {
	position: absolute;
	inset: 0;
	transform: translateZ(calc(var(--book-depth) + 1.4px));
	transform-style: preserve-3d;
	pointer-events: none;
}

.turn-sheet {
	position: absolute;
	top: 0;
	right: 0;
	z-index: 14;
	width: 50%;
	height: 100%;
	visibility: hidden;
	transform-origin: left center;
	transform-style: preserve-3d;
	pointer-events: none;
}

.turn-sheet-face {
	position: absolute;
	inset: 0;
	background: linear-gradient(90deg, color-mix(in oklab, var(--menu-ink) 4%, transparent), transparent 24%), var(--menu-sheet);
	box-shadow: -10px 4px 24px color-mix(in oklab, var(--menu-ink) 16%, transparent);
	backface-visibility: hidden;
	-webkit-backface-visibility: hidden;
}

.turn-sheet-face .page-copy {
	border: 1px solid color-mix(in oklab, var(--menu-ink) 16%, transparent);
}

.turn-sheet-face .page-copy.is-left-copy {
	border-right: 0;
}

.turn-sheet-face .page-copy.is-right-copy {
	border-left: 0;
}

.turn-sheet-back {
	background: linear-gradient(270deg, color-mix(in oklab, var(--menu-ink) 5%, transparent), transparent 28%), var(--menu-paper);
	box-shadow: 10px 4px 24px color-mix(in oklab, var(--menu-ink) 14%, transparent);
	transform: rotateY(180deg);
}

.turn-sheet-shade {
	position: absolute;
	inset: 0;
	z-index: 2;
	background: linear-gradient(90deg, color-mix(in oklab, var(--menu-ink) 12%, transparent), transparent 36%);
	pointer-events: none;
}

.turn-sheet-back .turn-sheet-shade {
	background: linear-gradient(270deg, color-mix(in oklab, var(--menu-ink) 10%, transparent), transparent 38%);
}

.cover-hinge {
	position: absolute;
	top: 0;
	right: 0;
	bottom: 0;
	width: 50%;
	transform: translateZ(calc(var(--book-depth) + 0.6px));
	transform-style: preserve-3d;
	pointer-events: none;
}

.book-cover {
	--edge-depth: var(--cover-depth);
	position: absolute;
	inset: 0;
	transform-origin: left center;
	transform-style: preserve-3d;
	will-change: transform;
}

.cover-face {
	position: absolute;
	inset: 0;
	backface-visibility: hidden;
	-webkit-backface-visibility: hidden;
}

.cover-face-front {
	display: flex;
	align-items: center;
	justify-content: center;
	flex-direction: column;
	border: 1px solid color-mix(in oklab, var(--menu-brass) 58%, transparent);
	background: var(--menu-cover);
	box-shadow:
		inset -3px 0 5px -3px color-mix(in oklab, var(--menu-ink) 32%, transparent),
		inset 0 -3px 5px -3px color-mix(in oklab, var(--menu-ink) 28%, transparent);
	color: var(--menu-brass);
	transform: translateZ(var(--cover-depth));
}

.cover-face-back {
	transform: rotateY(180deg);
}

.cover-face-front > strong,
.cover-face-front > :global(.emblem) {
	position: relative;
	z-index: 1;
}

.cover-face-front > strong {
	font-family: var(--font-serif);
	font-size: clamp(2rem, 5vw, 4.4rem);
	font-weight: 380;
	letter-spacing: 0.08em;
}

.cover-depth {
	position: absolute;
	inset: 0;
	z-index: 0;
	pointer-events: none;
}

.cover-depth::before,
.cover-depth::after {
	position: absolute;
	content: "";
	background: linear-gradient(135deg, color-mix(in oklab, var(--menu-cover) 86%, black), color-mix(in oklab, var(--menu-cover) 70%, black));
}

.cover-depth::before {
	top: 0.32rem;
	right: -0.22rem;
	bottom: -0.18rem;
	width: 0.22rem;
	border-right: 1px solid color-mix(in oklab, var(--menu-brass) 34%, transparent);
	box-shadow: 5px 8px 10px -8px color-mix(in oklab, var(--menu-ink) 52%, transparent);
}

.cover-depth::after {
	right: -0.22rem;
	bottom: -0.22rem;
	left: 0.32rem;
	height: 0.22rem;
	border-bottom: 1px solid color-mix(in oklab, var(--menu-brass) 28%, transparent);
	box-shadow: 0 6px 10px -7px color-mix(in oklab, var(--menu-ink) 48%, transparent);
}

.cover-rule {
	position: absolute;
	top: 10%;
	right: 12%;
	left: 12%;
	height: 1px;
	background: color-mix(in oklab, var(--menu-brass) 65%, transparent);
}

.cover-rule-bottom {
	top: auto;
	bottom: 10%;
}

.cover-sheen {
	position: absolute;
	inset: 0;
	z-index: 2;
	overflow: hidden;
	pointer-events: none;
}

.cover-gloss,
.cover-shade {
	position: absolute;
}

.cover-gloss {
	/* Same 62% x 58% ellipse, centred at 32% x 26%, as the original light.
	   Its transparent edges can now move without regenerating the gradient. */
	left: -30%;
	top: -32%;
	width: 124%;
	height: 116%;
	background: radial-gradient(
		ellipse 50% 50% at center,
		color-mix(in oklab, #fff1d4 14%, transparent),
		color-mix(in oklab, #fff1d4 5%, transparent) 42%,
		transparent 74%
	);
	will-change: transform, opacity;
}

.cover-shade {
	inset: 0;
	background: linear-gradient(
		128deg,
		transparent 34%,
		color-mix(in oklab, color-mix(in oklab, var(--menu-ink) 76%, var(--menu-cover)) 15%, transparent)
	);
	will-change: opacity;
}

@media (width < 56.25rem) {
	.book-layer {
		display: none;
	}
}
</style>
