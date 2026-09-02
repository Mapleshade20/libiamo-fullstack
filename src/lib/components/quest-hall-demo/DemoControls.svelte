<script lang="ts">
import type { CarteDemoControlGroup, CarteDemoControlOption } from "./types";

interface Props {
	groups: readonly CarteDemoControlGroup[];
	title?: string;
	description?: string;
	id?: string;
	class?: string;
}

let {
	groups,
	title = "Laboratoire CARTE",
	description = "Comparez une composition et un état sans quitter cette page.",
	id = "carte-demo-controls",
	class: className = "",
}: Props = $props();

function choose(group: CarteDemoControlGroup, option: CarteDemoControlOption) {
	if (option.disabled) return;
	group.onselect?.(option.value);
}
</script>

<aside class="demo-controls {className}" aria-labelledby="{id}-title" aria-describedby="{id}-description">
	<div class="control-intro">
		<p class="control-kicker">Prototype interactif</p>
		<h2 id="{id}-title">{title}</h2>
		<p id="{id}-description">{description}</p>
	</div>
	<div class="control-groups">
		{#each groups as group (group.id)}
			<fieldset>
				<legend>{group.label}</legend>
				<div class="option-list">
					{#each group.options as option (option.value)}
						{#if option.disabled}
							<span class="control-option" class:is-active={group.value === option.value} aria-disabled="true">{option.label}</span>
						{:else if option.href}
							<a
								class="control-option"
								class:is-active={group.value === option.value}
								href={option.href}
								aria-current={group.value === option.value ? "page" : undefined}
							>
								{option.label}
							</a>
						{:else}
							<button
								type="button"
								class="control-option"
								class:is-active={group.value === option.value}
								aria-pressed={group.value === option.value}
								onclick={() => choose(group, option)}
							>
								{option.label}
							</button>
						{/if}
					{/each}
				</div>
			</fieldset>
		{/each}
	</div>
</aside>

<style>
.demo-controls {
	display: grid;
	grid-template-columns: minmax(12rem, 0.7fr) minmax(0, 1.8fr);
	gap: 1.25rem 2rem;
	padding: 1rem 1.15rem;
	border: 1px solid color-mix(in oklab, var(--carte-ink, #2d2924) 18%, transparent);
	border-radius: 0.65rem;
	background: color-mix(in oklab, var(--carte-paper, #f7f1e6) 86%, transparent);
	box-shadow: 0 8px 24px color-mix(in oklab, var(--carte-ink, #2d2924) 7%, transparent);
	color: var(--carte-ink, #2d2924);
	font-family: var(--font-sans);
}

.control-intro,
.control-intro p,
.control-intro h2,
fieldset {
	margin: 0;
}

.control-kicker,
legend {
	font-size: 0.66rem;
	font-weight: 750;
	letter-spacing: 0.11em;
	text-transform: uppercase;
	color: var(--carte-wine, #803945);
}

.control-intro h2 {
	margin-top: 0.2rem;
	font-size: 1rem;
	font-weight: 750;
	line-height: 1.2;
}

.control-intro p:last-child {
	margin-top: 0.28rem;
	font-size: 0.76rem;
	line-height: 1.45;
	color: var(--carte-ink-muted, #6d665d);
}

.control-groups {
	display: flex;
	min-width: 0;
	flex-wrap: wrap;
	align-items: start;
	gap: 0.85rem 1.5rem;
}

fieldset {
	min-width: 0;
	padding: 0;
	border: 0;
}

legend {
	margin-bottom: 0.38rem;
}

.option-list {
	display: flex;
	flex-wrap: wrap;
	gap: 0.5rem;
}

.control-option {
	display: inline-flex;
	min-height: 2.75rem;
	align-items: center;
	justify-content: center;
	padding: 0.58rem 0.78rem;
	border: 1px solid color-mix(in oklab, var(--carte-ink, #2d2924) 20%, transparent);
	border-radius: 999px;
	background: color-mix(in oklab, var(--carte-sheet, #fffaf1) 86%, transparent);
	color: var(--carte-ink-muted, #6d665d);
	font: inherit;
	font-size: 0.74rem;
	font-weight: 650;
	line-height: 1.15;
	text-decoration: none;
	cursor: pointer;
	transition:
		background var(--carte-duration-fast, 180ms) ease,
		border-color var(--carte-duration-fast, 180ms) ease,
		color var(--carte-duration-fast, 180ms) ease;
}

.control-option:hover:not([aria-disabled="true"]),
.control-option.is-active {
	border-color: var(--carte-wine, #803945);
	background: color-mix(in oklab, var(--carte-wine, #803945) 10%, var(--carte-sheet, #fffaf1));
	color: var(--carte-wine, #803945);
}

.control-option:focus-visible {
	outline: 2px solid var(--carte-focus, #305f89);
	outline-offset: 2px;
}

.control-option[aria-disabled="true"] {
	cursor: not-allowed;
	opacity: 0.5;
}

@media (max-width: 47.99rem) {
	.demo-controls {
		grid-template-columns: 1fr;
		gap: 0.85rem;
		padding: 0.9rem;
	}

	.control-groups,
	fieldset,
	.option-list {
		width: 100%;
	}

	.option-list {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.control-option {
		width: 100%;
	}
}

@media (max-width: 23rem) {
	.option-list {
		grid-template-columns: 1fr;
	}
}

@media (prefers-reduced-motion: reduce) {
	.control-option {
		transition: none;
	}
}
</style>
