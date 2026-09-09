<script lang="ts">
import type { QuestMenuSection } from "$lib/quest-hall/menu";

export interface QuestMenuRibbon {
	id: QuestMenuSection;
	label: string;
	shortLabel: string;
	count: number;
}

interface Props {
	tabs: QuestMenuRibbon[];
	value: QuestMenuSection;
	label: string;
	onselect: (section: QuestMenuSection) => void;
}

let { tabs, value, label, onselect }: Props = $props();
let buttons: HTMLButtonElement[] = $state([]);

function move(event: KeyboardEvent, index: number) {
	let destination: number | null = null;
	if (event.key === "ArrowUp") destination = (index - 1 + tabs.length) % tabs.length;
	if (event.key === "ArrowDown") destination = (index + 1) % tabs.length;
	if (event.key === "Home") destination = 0;
	if (event.key === "End") destination = tabs.length - 1;
	if (destination === null) return;
	event.preventDefault();
	buttons[destination]?.focus();
	onselect(tabs[destination].id);
}
</script>

<div class="ribbons" role="tablist" aria-label={label} aria-orientation="vertical">
	{#each tabs as tab, index (tab.id)}
		<button
			bind:this={buttons[index]}
			type="button"
			role="tab"
			class="ribbon"
			data-tone={tab.id}
			aria-label="{tab.label}, {tab.count}"
			aria-selected={value === tab.id}
			tabindex={value === tab.id ? 0 : -1}
			onclick={() => onselect(tab.id)}
			onkeydown={(event) => move(event, index)}
		>
			<span class="ribbon-face"><span class="ribbon-label">{tab.shortLabel}</span></span>
		</button>
	{/each}
</div>

<style>
.ribbons {
	display: flex;
	flex-direction: column;
	gap: 0.12rem;
}

.ribbon {
	display: flex;
	width: 4.3rem;
	min-width: 4.3rem;
	height: 2.75rem;
	min-height: 2.75rem;
	align-items: center;
	padding: 0;
	border: 0;
	background: transparent;
	cursor: pointer;
}

.ribbon-face {
	display: flex;
	width: 100%;
	height: 2.125rem;
	min-height: 2.125rem;
	align-items: center;
	justify-content: center;
	padding: 0.38rem 0.5rem 0.38rem 0.95rem;
	clip-path: polygon(0 0, 86% 0, 100% 50%, 86% 100%, 0 100%);
	background: var(--menu-wine);
	color: var(--menu-ribbon-text);
	font-family: var(--font-sans);
	font-size: 0.62rem;
	font-weight: 750;
	letter-spacing: 0.035em;
	white-space: nowrap;
	transition: transform 180ms cubic-bezier(0.22, 1, 0.36, 1);
}

.ribbon[data-tone="weekly"] .ribbon-face {
	background: var(--menu-olive);
}

.ribbon[data-tone="translation"] .ribbon-face {
	background: var(--menu-blue);
}

.ribbon:hover .ribbon-face,
.ribbon[aria-selected="true"] .ribbon-face {
	transform: translateX(0.32rem);
}

.ribbon:focus-visible {
	outline: 0;
}

.ribbon:focus-visible .ribbon-face {
	box-shadow:
		inset 0 0 0 2px var(--menu-sheet),
		inset 1px 0 color-mix(in oklab, white 18%, transparent),
		inset -1px 0 color-mix(in oklab, black 20%, transparent);
}

@media (prefers-reduced-motion: reduce) {
	.ribbon-face {
		transition: none;
	}
}
</style>
