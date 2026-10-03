<script lang="ts">
import RequiredMark from "$lib/components/admin/RequiredMark.svelte";
import { DIFFICULTY_CEFR, DIFFICULTY_LEVELS, type DifficultyLevel, difficultyLabelKey } from "$lib/constants";
import { t } from "$lib/i18n";
import "$lib/components/quest-hall/difficulty.css";

/** Task difficulty as one of three named levels, in the Hall's difficulty colours; one input tall. */
let { value = $bindable(2), name = "difficulty", error }: { value?: number; name?: string; error?: string } = $props();
</script>

<fieldset class="space-y-2" aria-describedby={error ? `${name}-error` : undefined}>
	<legend class="mb-2 flex text-sm font-medium leading-none">Difficulty<RequiredMark /></legend>
	<div class="segments">
		{#each DIFFICULTY_LEVELS as level (level)}
			<label class="segment quest-difficulty-tone" data-level={level}>
				<input class="sr-only" type="radio" {name} value={level} bind:group={value} required>
				<span class="name truncate">{t("en", difficultyLabelKey(level))}</span>
				<span class="meta">
					<span class="dots" aria-hidden="true">
						{#each DIFFICULTY_LEVELS as dot (dot)}
							<span class="dot" class:is-filled={dot <= level}></span>
						{/each}
					</span>
					{DIFFICULTY_CEFR[level as DifficultyLevel]}
				</span>
			</label>
		{/each}
	</div>
	{#if error}
		<p id="{name}-error" data-field-error={name} class="field-error-message">{error}</p>
	{/if}
</fieldset>

<style>
fieldset {
	min-width: 0;
}

/* One input tall, split in three like a segmented control. */
.segments {
	display: grid;
	grid-template-columns: repeat(3, minmax(0, 1fr));
	height: 2.5rem;
	border: 1px solid var(--input);
	border-radius: var(--radius-lg);
	background: rgb(255 255 255 / 0.8);
	overflow: hidden;
}

.segment {
	display: flex;
	flex-direction: column;
	justify-content: center;
	min-width: 0;
	padding: 0 0.6rem;
	cursor: pointer;
	transition:
		background-color 150ms var(--ease-panel),
		box-shadow 150ms var(--ease-panel);
}

.segment + .segment {
	border-left: 1px solid var(--input);
}

.segment:hover {
	background: color-mix(in oklab, var(--quest-difficulty-color) 5%, var(--background));
}

.segment:has(input:checked) {
	background: color-mix(in oklab, var(--quest-difficulty-color) 10%, var(--background));
	box-shadow: inset 0 -2px 0 var(--quest-difficulty-color);
}

.segment:has(input:focus-visible) {
	box-shadow: inset 0 0 0 2px color-mix(in oklab, var(--ring) 70%, transparent);
}

.name {
	min-width: 0;
	font-size: 0.875rem;
	line-height: 1.1;
	color: var(--foreground);
}

.segment:has(input:checked) .name {
	color: var(--quest-difficulty-color);
	font-weight: 500;
}

.dots {
	display: inline-flex;
	flex: none;
	gap: 0.15rem;
	color: var(--quest-difficulty-color);
}

.dot {
	width: 5px;
	height: 5px;
	border: 1px solid currentColor;
	border-radius: 50%;
}

.dot.is-filled {
	background: currentColor;
}

.meta {
	display: flex;
	align-items: center;
	gap: 0.35rem;
	margin-top: 0.15rem;
	font-size: 0.75rem;
	line-height: 1.1;
	color: var(--muted-foreground);
	font-variant-numeric: tabular-nums;
}

@media (prefers-reduced-motion: reduce) {
	.segment {
		transition: none;
	}
}
</style>
