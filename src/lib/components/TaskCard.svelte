<script lang="ts">
import CheckCircle2 from "@lucide/svelte/icons/check-circle-2";
import type { Component } from "svelte";

interface Props {
	id: number;
	title: string;
	difficulty: number;
	icon: Component;
	summary?: string | null;
	summaryTitle: string;
	completedLabel: string;
	draftLabel: string;
	href: string;
	buttonLabel: string;
	status?: string | null;
	isFinished?: boolean;
	flipped: boolean;
	onflip: (id: number) => void;
	onenter?: (event: MouseEvent, taskId: number) => void;
}

let {
	id,
	title,
	difficulty,
	icon: Icon,
	summary = null,
	summaryTitle,
	completedLabel,
	draftLabel,
	href,
	buttonLabel,
	status = null,
	isFinished = false,
	flipped,
	onflip,
	onenter,
}: Props = $props();
</script>

<div
	class="card-scene h-56 w-full cursor-pointer transition-transform duration-[400ms] ease-out hover:scale-[1.02] hover:-translate-y-1"
	role="button"
	tabindex="0"
	onclick={() => onflip(id)}
	onkeydown={(e) => e.key === "Enter" && onflip(id)}
>
	<div class="card-inner w-full h-full" class:is-flipped={flipped}>
		<div
			class="card-face absolute inset-0 {isFinished
				? 'bg-green-50/40 border-green-500/40'
				: 'bg-card border-border'} rounded-2xl border p-5 flex flex-col justify-between shadow-sm transition-shadow duration-500 hover:shadow-xl"
		>
			{#if isFinished}
				<div class="absolute inset-0 overflow-hidden rounded-2xl pointer-events-none z-0">
					<div class="absolute -right-6 -top-6 text-green-500/10 rotate-12"><CheckCircle2 size={130} /></div>
				</div>
			{/if}
			<div class="flex justify-between items-center">
				<div
					class="p-2.5 rounded-full {isFinished
						? 'bg-green-500/20 border-green-500/30 text-green-700'
						: 'bg-background/60 border-border text-foreground'} border"
				>
					<Icon size={20} strokeWidth={1} class="currentColor" />
				</div>
				<span class="flex gap-0.5">
					{#each Array.from({ length: 3 }, (_, i) => i < difficulty) as filled}
						<span
							class="inline-block h-2 w-2 rounded-full {filled
								? isFinished
									? 'bg-green-600/60'
									: 'bg-muted-foreground'
								: 'bg-border'}"
						></span>
					{/each}
				</span>
			</div>
			<div>
				{#if isFinished}
					<span class="text-xs font-bold text-green-600 flex items-center gap-1 mb-1.5 uppercase tracking-wider">
						<CheckCircle2 size={12} strokeWidth={2.5} />
						{completedLabel}
					</span>
				{:else if status === "draft"}
					<span
						class="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest"
					>
						{draftLabel}
					</span>
				{/if}
				<h3
					class="font-serif text-xl {isFinished
						? 'text-green-950'
						: 'text-foreground'} leading-tight"
				>
					{title}
				</h3>
			</div>
		</div>

		<div
			class="card-face card-back absolute inset-0 {isFinished
				? 'bg-green-50/90 border-green-500/40'
				: 'bg-card border-border'} rounded-2xl border p-5 flex flex-col justify-between shadow-xl"
		>
			<div class="pt-1">
				<h4
					class="font-serif text-lg mb-3 {isFinished
						? 'text-green-800'
						: 'text-foreground'}"
				>
					{summaryTitle}
				</h4>
				<p
					class="text-base md:leading-6 {isFinished
						? 'text-green-700/80'
						: 'text-muted-foreground'} leading-5 line-clamp-4"
				>
					{summary ?? "—"}
				</p>
			</div>
			<div class="space-y-2.5">
				<a
					{href}
					onclick={(e) => { e.stopPropagation(); onenter?.(e, id); }}
					class="block w-full py-2 {isFinished
						? 'bg-green-600 text-white hover:bg-green-700'
						: 'bg-foreground text-background hover:opacity-90'} rounded-lg text-sm font-medium tracking-wide text-center transition-opacity shadow-md"
				>
					{buttonLabel}
				</a>
			</div>
		</div>
	</div>
</div>

<style>
.card-scene {
	perspective: 1000px;
}

.card-inner {
	position: relative;
	transform-style: preserve-3d;
	transition: transform 0.7s cubic-bezier(0.23, 1, 0.32, 1);
}

.card-inner.is-flipped {
	transform: rotateY(180deg);
}

.card-face {
	backface-visibility: hidden;
}

.card-back {
	transform: rotateY(180deg);
}
</style>
