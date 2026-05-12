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
import TaskCard from "$lib/components/TaskCard.svelte";
import { type LanguageCode, t } from "$lib/i18n";
import { captureTaskEnterTransition } from "$lib/task-transition";

let { data } = $props();
let lang = $derived(data.language as LanguageCode);

let flippedId = $state<number | null>(null);

function toggleFlip(id: number) {
	flippedId = flippedId === id ? null : id;
}

function enterTask(event: MouseEvent, taskId: number) {
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

	goto(link.href);
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
					<TaskCard
						id={task.id}
						title={task.title}
						difficulty={task.templateDifficulty}
						icon={uiIcons[task.templateUi] ?? MessageSquare}
						shortObjective={task.shortObjective}
						href="/task/{task.id}"
						buttonLabel={t(lang, "hall.enter")}
						flipped={flippedId === task.id}
						onflip={toggleFlip}
						onenter={enterTask}
					/>
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
					<TaskCard
						id={task.id}
						title={task.title}
						difficulty={task.templateDifficulty}
						icon={uiIcons[task.templateUi] ?? MessageSquare}
						shortObjective={task.shortObjective}
						href="/task/{task.id}"
						buttonLabel={t(lang, "hall.enter")}
						flipped={flippedId === task.id}
						onflip={toggleFlip}
						onenter={enterTask}
					/>
				{/each}
			</div>
		{/if}
	</section>
</div>
