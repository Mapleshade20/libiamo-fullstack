<script lang="ts">
import ArrowLeft from "@lucide/svelte/icons/arrow-left";
import ArrowRight from "@lucide/svelte/icons/arrow-right";
import BookOpen from "@lucide/svelte/icons/book-open";
import Hash from "@lucide/svelte/icons/hash";
import Languages from "@lucide/svelte/icons/languages";
import Mail from "@lucide/svelte/icons/mail";
import MessageCircle from "@lucide/svelte/icons/message-circle";
import MessageSquare from "@lucide/svelte/icons/message-square";
import type { Component } from "svelte";
import { fly } from "svelte/transition";
import { goto } from "$app/navigation";
import { captureTaskEnterTransition } from "$lib/client/task-transition";
import TaskCard from "$lib/components/TaskCard.svelte";
import { type LanguageCode, t } from "$lib/i18n";
import { shiftCalendarMonth } from "$lib/month";

let { data } = $props();
let lang = $derived(data.user.activeLanguage as LanguageCode);

let flippedId = $state<number | null>(null);
let flippedTranslationId = $state<number | null>(null);
let monthDirection = $state(1);
let translationMonth = $state((() => data.translationMonth)());
let loadedLanguage = $state((() => data.user.activeLanguage)());
let typingTimer: ReturnType<typeof setInterval> | null = null;
let displayedSubtitle = $state("");
let translationTasks = $derived(data.translationTasks.filter((task) => task.createdMonth === translationMonth));

function startTypewriter(text: string, speed = 20) {
	if (typingTimer !== null) clearInterval(typingTimer);
	displayedSubtitle = "";
	let i = 0;
	const timer = setInterval(() => {
		if (i < text.length) {
			displayedSubtitle += text[i];
			i++;
		} else {
			clearInterval(timer);
			typingTimer = null;
		}
	}, speed);
	typingTimer = timer;
}

$effect(() => {
	startTypewriter(data.subtitle);
	return () => {
		if (typingTimer !== null) {
			clearInterval(typingTimer);
			typingTimer = null;
		}
	};
});

$effect(() => {
	if (data.user.activeLanguage === loadedLanguage) return;
	loadedLanguage = data.user.activeLanguage;
	translationMonth = data.translationMonth;
	flippedTranslationId = null;
});

function toggleFlip(id: number) {
	flippedId = flippedId === id ? null : id;
}

function toggleTranslationFlip(id: number) {
	flippedTranslationId = flippedTranslationId === id ? null : id;
}

function translationMonthLabel(month: string) {
	return new Date(`${month}-01T12:00:00.000Z`).toLocaleDateString(undefined, {
		month: "long",
		year: "numeric",
		timeZone: "UTC",
	});
}

function changeTranslationMonth(amount: -1 | 1) {
	monthDirection = amount;
	translationMonth = shiftCalendarMonth(translationMonth, amount);
	flippedTranslationId = null;
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

<svelte:head>
	<title>Quest Hall · Libiamo</title>
	<meta name="description" content="Choose today's language practice quests and continue your learning routine.">
</svelte:head>

<div class="space-y-10">
	<section>
		<h1 class="text-3xl md:text-4xl text-gray-800 font-normal leading-tight">
			{data.greeting}<br>
			<span class="text-gray-500 italic relative inline-block">
				<span class="invisible">{data.subtitle}</span>
				<span class="absolute left-0 top-0">{displayedSubtitle}</span>
			</span>
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
						isFinished={task.sessionStatus === "completed" || task.sessionStatus === "evaluated"}
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
						isFinished={task.sessionStatus === "completed" || task.sessionStatus === "evaluated"}
						flipped={flippedId === task.id}
						onflip={toggleFlip}
						onenter={enterTask}
					/>
				{/each}
			</div>
		{/if}
	</section>

	<section>
		<div class="mb-5 flex flex-wrap items-center gap-3 sm:gap-4">
			<h2 class="text-2xl">{t(lang, "translate.title")}</h2>
			<div class="h-px min-w-8 flex-1 bg-border"></div>
			<div class="flex items-center rounded-full border border-border bg-card/70 p-1 shadow-sm" aria-label="Translation task month">
				<button
					type="button"
					class="group flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors duration-200 hover:bg-secondary hover:text-foreground"
					aria-label="Previous month"
					onclick={() => { changeTranslationMonth(-1); }}
				>
					<ArrowLeft size={17} class="transition-transform duration-200 group-hover:-translate-x-0.5" />
				</button>
				<span class="min-w-32 px-2 text-center text-xs font-semibold uppercase tracking-[0.14em] text-foreground">
					{translationMonthLabel(translationMonth)}
				</span>
				<button
					type="button"
					class="group flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors duration-200 hover:bg-secondary hover:text-foreground"
					aria-label="Next month"
					onclick={() => { changeTranslationMonth(1); }}
				>
					<ArrowRight size={17} class="transition-transform duration-200 group-hover:translate-x-0.5" />
				</button>
			</div>
		</div>

		{#key translationMonth}
			<div class="min-h-56" in:fly={{ x: monthDirection * 28, duration: 320, opacity: 0.15 }}>
				{#if translationTasks.length === 0}
					<div class="rounded-2xl border border-dashed border-border bg-card/35 px-6 py-10 text-center">
						<p class="text-muted-foreground">{t(lang, "translate.empty")}</p>
					</div>
				{:else}
					<div class="grid gap-5 md:grid-cols-3">
						{#each translationTasks as task}
							{@const status = data.translationStatusMap[String(task.id)]}
							{@const isFinished = status === "completed"}
							<TaskCard
								id={task.id}
								title={task.titleBase}
								difficulty={task.difficulty}
								icon={Languages}
								shortObjective={task.shortObjectiveBase}
								href="/translate/{task.id}"
								buttonLabel={isFinished ? "View Result" : status ? "Continue" : t(lang, "hall.enter")}
								status={isFinished ? null : status === "draft" ? "draft" : status ? "in_progress" : null}
								{isFinished}
								flipped={flippedTranslationId === task.id}
								onflip={toggleTranslationFlip}
								onenter={enterTask}
							/>
						{/each}
					</div>
				{/if}
			</div>
		{/key}
	</section>
</div>
