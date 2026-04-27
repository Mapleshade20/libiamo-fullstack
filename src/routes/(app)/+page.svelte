<script lang="ts">
import BookOpen from "@lucide/svelte/icons/book-open";
import CheckCircle2 from "@lucide/svelte/icons/check-circle-2";
import Hash from "@lucide/svelte/icons/hash";
import Languages from "@lucide/svelte/icons/languages";
import Mail from "@lucide/svelte/icons/mail";
import MessageCircle from "@lucide/svelte/icons/message-circle";
import MessageSquare from "@lucide/svelte/icons/message-square";
import type { Component } from "svelte";
import { goto } from "$app/navigation";
import { type LanguageCode, t } from "$lib/i18n";
import { captureTaskEnterTransition } from "$lib/task-transition";

let { data } = $props();
let lang = $derived(data.language as LanguageCode);

let flippedId = $state<number | null>(null);

function toggleFlip(id: number) {
	flippedId = flippedId === id ? null : id;
}

async function enterTask(event: MouseEvent, taskId: number) {
	event.preventDefault();
	event.stopPropagation();

	const link = event.currentTarget as HTMLAnchorElement;
	const face = link.closest(".card-face") as HTMLElement | null;
	const cardScene = link.closest(".card-scene") as HTMLElement | null;
	const sourceEl = face ?? cardScene;

	if (sourceEl) {
		const rect = sourceEl.getBoundingClientRect();
		const radius = Number.parseFloat(getComputedStyle(sourceEl).borderRadius) || 16;

		captureTaskEnterTransition({
			taskId,
			href: link.href,
			sourceRect: {
				top: rect.top,
				left: rect.left,
				width: rect.width,
				height: rect.height,
			},
			sourceRadius: radius,
		});
	}

	await goto(link.href);
}

const uiIcons: Record<string, Component> = {
	reddit: MessageSquare,
	apple_mail: Mail,
	discord: Hash,
	imessage: MessageCircle,
	ao3: BookOpen,
	translator: Languages,
};
</script>

{#snippet taskCard(task: any)}
	{@const Icon = uiIcons[task.templateUi] ?? MessageSquare}
	{@const isFinished =
		task.sessionStatus === "completed" ||
		task.sessionStatus === "evaluated"}
	<div
		class="card-scene h-56 w-full cursor-pointer transition-transform duration-[400ms] ease-out hover:scale-[1.02] hover:-translate-y-1"
		role="button"
		tabindex="0"
		onclick={() => toggleFlip(task.id)}
		onkeydown={(e) => e.key === "Enter" && toggleFlip(task.id)}
	>
		<div class="card-inner w-full h-full" class:is-flipped={flippedId === task.id}>
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
						{#each Array.from({ length: 3 }, (_, i) => i < task.templateDifficulty) as filled}
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
						<span class="text-[10px] font-bold text-green-600 flex items-center gap-1 mb-1.5 uppercase tracking-wider"
							><CheckCircle2 size={12} strokeWidth={2.5} />
							Completed</span
						>
					{/if}
					<h3
						class="font-serif text-xl {isFinished
							? 'text-green-950'
							: 'text-foreground'} leading-tight"
					>
						{task.title}
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
						class="font-serif text-base mb-3 {isFinished
							? 'text-green-800'
							: 'text-foreground'}"
					>
						Mission Objective
					</h4>
					<p
						class="text-sm {isFinished
							? 'text-green-700/80'
							: 'text-muted-foreground'} leading-5 line-clamp-4"
					>
						{task.shortObjective ?? "—"}
					</p>
				</div>
				<div class="space-y-2.5">
					<a
						href="/task/{task.id}"
						onclick={(e) => enterTask(e, task.id)}
						class="block w-full py-2 {isFinished
							? 'bg-green-600 text-white hover:bg-green-700'
							: 'bg-foreground text-background hover:opacity-90'} rounded-lg text-xs font-medium tracking-wide text-center transition-opacity shadow-md"
					>
						{isFinished
							? t(lang, "hall.reviewReport")
							: t(lang, "hall.enter")}
					</a>
				</div>
			</div>
		</div>
	</div>
{/snippet}

<div class="space-y-10">
	<section>
		<h1 class="text-3xl md:text-4xl text-gray-800 font-medium leading-tight">
			Welcome back, {data.user.name}.<br>
			<span class="text-gray-500 italic">Which world will you inhabit today?</span>
		</h1>
	</section>

	<section>
		<div class="flex items-center gap-4 mb-5">
			<h2 class="text-2xl">{t(lang, "hall.today")}</h2>
			<div class="h-px flex-1 bg-border"></div>
		</div>
		{#if data.dailyTasks.length === 0}
			<p class="text-muted-foreground">{t(lang, "hall.noTasks")}</p>
		{:else}
			<div class="grid gap-5 md:grid-cols-3">
				{#each data.dailyTasks as task}
					{@render taskCard(task)}
				{/each}
			</div>
		{/if}
	</section>

	<section>
		<div class="flex items-center gap-4 mb-5">
			<h2 class="text-2xl">{t(lang, "hall.thisWeek")}</h2>
			<div class="h-px flex-1 bg-border"></div>
		</div>
		{#if data.weeklyTasks.length === 0}
			<p class="text-muted-foreground">{t(lang, "hall.noTasks")}</p>
		{:else}
			<div class="grid gap-5 md:grid-cols-3">
				{#each data.weeklyTasks as task}
					{@render taskCard(task)}
				{/each}
			</div>
		{/if}
	</section>
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
