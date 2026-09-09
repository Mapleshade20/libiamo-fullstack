<script lang="ts">
import type { StudyQueueCounts } from "$lib/review";
import type { StudyCardAction, StudyCardActionTone } from "./study-card";

interface Props {
	vocab: string;
	nativeDefinition: string;
	nativeText: string;
	targetText: string;
	revealed: boolean;
	showAnswerLabel: string;
	counts: StudyQueueCounts;
	countLabels: { new: string; learning: string; review: string };
	actions: StudyCardAction[];
	disabled?: boolean;
	onreveal: () => void;
	onaction: (id: string) => void;
}

let {
	vocab,
	nativeDefinition,
	nativeText,
	targetText,
	revealed,
	showAnswerLabel,
	counts,
	countLabels,
	actions,
	disabled = false,
	onreveal,
	onaction,
}: Props = $props();

function isInteractiveTarget(target: EventTarget | null) {
	return target instanceof HTMLElement && !!target.closest("button, a, input, textarea, select, [contenteditable='true']");
}

function handleKeydown(event: KeyboardEvent) {
	if (disabled || event.metaKey || event.ctrlKey || event.altKey || isInteractiveTarget(event.target)) return;
	if (!revealed && (event.key === " " || event.key === "Enter")) {
		event.preventDefault();
		onreveal();
		return;
	}
	if (!revealed) return;
	const action = actions.find((item) => item.shortcut === event.key);
	if (!action) return;
	event.preventDefault();
	onaction(action.id);
}

function actionClasses(tone: StudyCardActionTone) {
	switch (tone) {
		case "again":
			return "border-[#a94f4a] bg-[#b85d57] text-white shadow-sm hover:bg-[#a94f4a]";
		case "hard":
			return "border-[#9a682e] bg-[#ad7738] text-white shadow-sm hover:bg-[#9a682e]";
		case "good":
			return "border-[#4f785a] bg-[#5f8969] text-white shadow-sm hover:bg-[#4f785a]";
		case "easy":
			return "border-[#4c7193] bg-[#5d82a5] text-white shadow-sm hover:bg-[#4c7193]";
	}
}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="w-full pb-40 sm:pb-44">
	<article
		class="grid min-h-[27rem] overflow-hidden rounded-[1.75rem] border border-border/80 bg-card shadow-[0_18px_50px_-35px_rgba(55,45,35,0.45)] sm:min-h-[30rem]"
		aria-label={showAnswerLabel}
	>
		<section class="relative grid min-h-44 content-center gap-5 px-6 py-8 text-center sm:min-h-48 sm:gap-6 sm:px-12 sm:py-9">
			<p class="mx-auto max-w-3xl font-prose text-xl leading-normal text-foreground sm:text-2xl">{nativeDefinition}</p>
			<p
				class="mx-auto max-w-3xl font-prose text-2xl font-semibold leading-tight text-foreground transition-opacity duration-300 sm:text-3xl"
				class:invisible={!revealed}
				class:opacity-0={!revealed}
				aria-hidden={!revealed}
			>
				{vocab}
			</p>
			<div class="absolute inset-x-6 bottom-0 border-t border-stone-400/45 sm:inset-x-10"></div>
		</section>

		<section class="grid min-h-44 content-center gap-5 px-6 py-8 text-left sm:min-h-48 sm:gap-6 sm:px-12 sm:py-9">
			<p class="mx-auto w-full max-w-3xl font-prose text-xl leading-relaxed text-muted-foreground sm:text-2xl">{nativeText}</p>
			<div
				class="example-quote mx-auto w-full max-w-3xl font-prose text-xl text-[#a46042] transition-opacity duration-300 sm:text-2xl"
				class:invisible={!revealed}
				class:opacity-0={!revealed}
				aria-hidden={!revealed}
			>
				<p class="leading-normal">{targetText}</p>
			</div>
		</section>
	</article>
</div>

<footer
	class="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-12px_30px_-24px_rgba(55,45,35,0.45)] backdrop-blur-md"
>
	<div class="mx-auto w-full max-w-3xl">
		<div
			class="mb-2 flex items-center justify-center gap-2 font-mono text-lg font-semibold tabular-nums"
			aria-label={`${countLabels.new}: ${counts.new}; ${countLabels.learning}: ${counts.learning}; ${countLabels.review}: ${counts.review}`}
		>
			<span class="border-b border-current text-[#4d85b5]" title={countLabels.new}>{counts.new}<span class="sr-only"> {countLabels.new}</span></span>
			<span class="text-muted-foreground" aria-hidden="true">+</span>
			<span class="border-b border-current text-[#b76565]" title={countLabels.learning}
				>{counts.learning}<span class="sr-only"> {countLabels.learning}</span></span
			>
			<span class="text-muted-foreground" aria-hidden="true">+</span>
			<span class="border-b border-current text-[#4d9b70]" title={countLabels.review}
				>{counts.review}<span class="sr-only"> {countLabels.review}</span></span
			>
		</div>

		<div class="flex min-h-16 items-center">
			{#if !revealed}
				<button
					type="button"
					class="h-14 w-full rounded-xl border border-foreground/15 bg-foreground text-lg font-semibold text-background shadow-sm transition-[background-color,transform] hover:bg-foreground/88 active:translate-y-px disabled:opacity-45"
					{disabled}
					onclick={onreveal}
				>
					{showAnswerLabel}
				</button>
			{:else}
				<div class="grid w-full grid-flow-col auto-cols-fr gap-3 sm:gap-4" aria-label={showAnswerLabel}>
					{#each actions as action}
						<button
							type="button"
							class="flex min-h-14 min-w-0 flex-col items-center justify-center rounded-md border px-2 py-2 text-sm font-semibold transition-colors sm:text-base {actionClasses(action.tone)} disabled:opacity-40"
							{disabled}
							onclick={() => onaction(action.id)}
						>
							<span>{action.label}</span>
							{#if action.detail}
								<span class="mt-0.5 text-[11px] font-normal opacity-65 sm:text-xs">{action.detail}</span>
							{/if}
						</button>
					{/each}
				</div>
			{/if}
		</div>
	</div>
</footer>

<style>
.example-quote {
	position: relative;
	border-left: 2px solid currentColor;
	padding: 32px 16px 12px;
}

.example-quote::before {
	position: absolute;
	top: 0;
	left: 12px;
	font-family: Arial, sans-serif;
	font-size: 2em;
	font-weight: 700;
	line-height: 1em;
	content: "“";
}
</style>
