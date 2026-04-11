<script lang="ts">
	import BookOpen from "@lucide/svelte/icons/book-open";
	import Hash from "@lucide/svelte/icons/hash";
	import Languages from "@lucide/svelte/icons/languages";
	import Mail from "@lucide/svelte/icons/mail";
	import MessageCircle from "@lucide/svelte/icons/message-circle";
	import MessageSquare from "@lucide/svelte/icons/message-square";
	import type { Component } from "svelte";
	import { goto } from "$app/navigation";
	import { type LangCode, t } from "$lib/i18n";
	import { captureTaskEnterTransition } from "$lib/task-transition";

	let { data } = $props();
	let lang = $derived(data.language as LangCode);

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
			const radius =
				Number.parseFloat(getComputedStyle(sourceEl).borderRadius) ||
				16;

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

{#snippet taskCard(task: (typeof data.dailyTasks)[0])}
	{@const Icon = uiIcons[task.templateUi] ?? MessageSquare}
	<div
		class="card-scene h-56 w-full cursor-pointer transition-transform duration-[400ms] ease-out hover:scale-[1.02] hover:-translate-y-1"
		role="button"
		tabindex="0"
		onclick={() => toggleFlip(task.id)}
		onkeydown={(e) => e.key === "Enter" && toggleFlip(task.id)}
	>
		<div
			class="card-inner w-full h-full"
			class:is-flipped={flippedId === task.id}
		>
			<!-- Front -->
			<div
				class="card-face absolute inset-0 bg-card rounded-2xl border border-border p-5 flex flex-col justify-between shadow-sm transition-shadow duration-500 hover:shadow-xl"
			>
				<div class="flex justify-between items-center">
					<div
						class="p-2.5 rounded-full bg-background/60 border border-border"
					>
						<Icon
							size={20}
							strokeWidth={1}
							class="text-foreground"
						/>
					</div>
					<span class="flex gap-0.5">
						{#each Array.from({ length: 3 }, (_, i) => i < task.templateDifficulty) as filled}
							<span
								class="inline-block h-2 w-2 rounded-full {filled
									? 'bg-muted-foreground'
									: 'bg-border'}"
							></span>
						{/each}
					</span>
				</div>
				<h3 class="font-serif text-xl text-foreground leading-tight">
					{task.titleResolved}
				</h3>
			</div>

			<!-- Back -->
			<div
				class="card-face card-back absolute inset-0 bg-card rounded-2xl border border-border p-5 flex flex-col justify-between shadow-xl"
			>
				<div class="pt-1">
					<h4 class="font-serif text-base mb-3 text-foreground">
						Mission Objective
					</h4>
					<p
						class="text-sm text-muted-foreground leading-5 line-clamp-4"
					>
						{task.shortObjectiveResolved ?? "—"}
					</p>
				</div>
				<div class="space-y-2.5">
					<a
						href="/task/{task.id}"
						onclick={(e) => enterTask(e, task.id)}
						class="block w-full py-2 bg-foreground text-background rounded-lg text-xs font-medium tracking-wide text-center hover:opacity-90 transition-opacity shadow-md"
					>
						{t(lang, "hall.enter")}
					</a>
				</div>
			</div>
		</div>
	</div>
{/snippet}

<div class="space-y-10">
	<!-- Greeting -->
	<section>
		<h2 class="font-serif text-3xl md:text-4xl text-gray-800 leading-tight">
			Welcome back, {data.user.name}.<br />
			<span class="text-gray-500 italic"
				>Which world will you inhabit today?</span
			>
		</h2>
	</section>

	<!-- Daily Quests -->
	<section>
		<div class="flex items-center gap-4 mb-5">
			<h3 class="font-serif text-2xl text-foreground whitespace-nowrap">
				{t(lang, "hall.today")}
			</h3>
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

	<!-- Weekly Quests -->
	<section>
		<div class="flex items-center gap-4 mb-5">
			<h3 class="font-serif text-2xl text-foreground whitespace-nowrap">
				{t(lang, "hall.thisWeek")}
			</h3>
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
