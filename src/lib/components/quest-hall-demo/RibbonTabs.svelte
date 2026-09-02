<script lang="ts">
import type { CarteRibbonTab } from "./types";

interface Props {
	tabs: readonly CarteRibbonTab[];
	value: string;
	onselect: (id: string) => void;
	label?: string;
	orientation?: "horizontal" | "vertical";
	variant?: "ribbon" | "bookmark";
	controls?: string;
	class?: string;
}

let {
	tabs,
	value,
	onselect,
	label = "Catégories de missions",
	orientation = "horizontal",
	variant = "ribbon",
	controls,
	class: className = "",
}: Props = $props();
let tabButtons: HTMLButtonElement[] = $state([]);

function selectTab(tab: CarteRibbonTab, focus = false) {
	if (tab.disabled) return;
	onselect(tab.id);
	if (!focus) return;
	const index = tabs.findIndex((candidate) => candidate.id === tab.id);
	queueMicrotask(() => tabButtons[index]?.focus());
}

function move(event: KeyboardEvent, currentIndex: number) {
	const previousKeys = orientation === "vertical" ? ["ArrowUp"] : ["ArrowLeft"];
	const nextKeys = orientation === "vertical" ? ["ArrowDown"] : ["ArrowRight"];
	const enabledIndexes = tabs.flatMap((tab, index) => (tab.disabled ? [] : [index]));
	if (enabledIndexes.length === 0) return;

	let destination: number | undefined;
	const enabledPosition = enabledIndexes.indexOf(currentIndex);
	if (previousKeys.includes(event.key)) {
		destination = enabledIndexes[(enabledPosition - 1 + enabledIndexes.length) % enabledIndexes.length];
	} else if (nextKeys.includes(event.key)) {
		destination = enabledIndexes[(enabledPosition + 1) % enabledIndexes.length];
	} else if (event.key === "Home") {
		destination = enabledIndexes[0];
	} else if (event.key === "End") {
		destination = enabledIndexes.at(-1);
	}

	if (destination === undefined) return;
	event.preventDefault();
	selectTab(tabs[destination], true);
}

function accessibleLabel(tab: CarteRibbonTab) {
	if (tab.count === undefined) return tab.label;
	return `${tab.label}, ${tab.count} ${tab.count === 1 ? "mission" : "missions"}`;
}
</script>

<div
	class="ribbon-tabs {className}"
	class:is-vertical={orientation === "vertical"}
	class:is-bookmark={variant === "bookmark"}
	role="tablist"
	aria-label={label}
	aria-orientation={orientation}
>
	{#each tabs as tab, index (tab.id)}
		<button
			bind:this={tabButtons[index]}
			type="button"
			role="tab"
			class="ribbon-tab"
			data-tone={tab.tone ?? ["wine", "olive", "blue"][index % 3]}
			aria-label={accessibleLabel(tab)}
			aria-selected={value === tab.id}
			aria-controls={controls ?? tab.panelId}
			tabindex={value === tab.id ? 0 : -1}
			disabled={tab.disabled}
			onclick={() => selectTab(tab)}
			onkeydown={(event) => move(event, index)}
		>
			<span class="ribbon-face" aria-hidden="true">
				<span class="ribbon-label">{variant === "bookmark" ? (tab.shortLabel ?? tab.label) : tab.label}</span>
				{#if tab.count !== undefined}
					<span class="ribbon-count">{tab.count}</span>
				{/if}
			</span>
		</button>
	{/each}
</div>

<style>
.ribbon-tabs {
	display: flex;
	align-items: flex-start;
	gap: 0.5rem;
	padding: 0.4rem;
}

.ribbon-tab {
	position: relative;
	display: grid;
	min-width: 5.5rem;
	min-height: 3rem;
	padding: 0;
	place-items: stretch;
	border: 0;
	border-radius: 0.25rem;
	background: transparent;
	cursor: pointer;
	font: inherit;
	-webkit-tap-highlight-color: transparent;
}

.ribbon-face {
	display: flex;
	min-height: 3rem;
	align-items: flex-start;
	justify-content: center;
	gap: 0.38rem;
	padding: 0.68rem 0.8rem 0.95rem;
	clip-path: polygon(0 0, 100% 0, 100% 78%, 50% 100%, 0 78%);
	background: var(--ribbon-color, var(--carte-wine, #803945));
	box-shadow:
		inset 1px 0 color-mix(in oklab, white 18%, transparent),
		inset -1px 0 color-mix(in oklab, black 20%, transparent);
	color: var(--carte-ribbon-text, #fffaf1);
	transition:
		transform var(--carte-duration-fast, 180ms) var(--carte-ease-out, cubic-bezier(0.22, 1, 0.36, 1)),
		filter var(--carte-duration-fast, 180ms) ease;
}

.ribbon-tab[data-tone="olive"] {
	--ribbon-color: var(--carte-olive, #65705a);
}

.ribbon-tab[data-tone="blue"] {
	--ribbon-color: var(--carte-blue, #526878);
}

.ribbon-tab[data-tone="ink"] {
	--ribbon-color: var(--carte-ink, #2d2924);
}

.ribbon-tab:hover:not(:disabled) .ribbon-face,
.ribbon-tab[aria-selected="true"] .ribbon-face {
	transform: translateY(-0.34rem);
	filter: saturate(1.06) brightness(1.04);
}

.ribbon-tab:focus-visible {
	outline: 2px solid var(--carte-focus, #305f89);
	outline-offset: 3px;
}

.ribbon-tab:disabled {
	cursor: not-allowed;
	opacity: 0.45;
}

.ribbon-label {
	font-family: var(--font-sans);
	font-size: 0.75rem;
	font-weight: 700;
	letter-spacing: 0.035em;
	line-height: 1.15;
}

.ribbon-count {
	display: inline-grid;
	min-width: 1.1rem;
	height: 1.1rem;
	place-items: center;
	border: 1px solid color-mix(in oklab, currentColor 62%, transparent);
	border-radius: 999px;
	font-family: var(--font-sans);
	font-size: 0.62rem;
	font-weight: 750;
	line-height: 1;
}

.is-vertical {
	flex-direction: column;
}

.is-vertical .ribbon-tab {
	width: 7.5rem;
}

.is-vertical .ribbon-face {
	align-items: center;
	justify-content: flex-start;
	padding: 0.65rem 1.15rem 0.65rem 0.8rem;
	clip-path: polygon(0 0, 82% 0, 100% 50%, 82% 100%, 0 100%);
}

.is-vertical .ribbon-tab:hover:not(:disabled) .ribbon-face,
.is-vertical .ribbon-tab[aria-selected="true"] .ribbon-face {
	transform: translateX(0.34rem);
}

.is-bookmark {
	align-items: flex-start;
	gap: 0.55rem;
	padding: 0;
}

.is-bookmark .ribbon-tab {
	width: 3rem;
	min-width: 3rem;
	min-height: 3rem;
}

.is-bookmark .ribbon-face {
	width: 100%;
	min-height: 3rem;
	align-items: center;
	justify-content: flex-end;
	flex-direction: column;
	gap: 0;
	padding: 1.7rem 0.65rem 0.8rem;
	clip-path: polygon(0 0, 100% 0, 100% 86%, 50% 100%, 0 86%);
}

.is-bookmark .ribbon-label {
	writing-mode: vertical-rl;
	text-orientation: mixed;
	white-space: nowrap;
}

.is-bookmark .ribbon-count {
	display: none;
}

.is-bookmark .ribbon-tab:hover:not(:disabled) .ribbon-face,
.is-bookmark .ribbon-tab[aria-selected="true"] .ribbon-face {
	transform: translateY(0.38rem);
}

@media (prefers-reduced-motion: reduce) {
	.ribbon-face {
		transition: none;
	}
}
</style>
