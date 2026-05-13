<script lang="ts">
import Languages from "@lucide/svelte/icons/languages";
import { goto } from "$app/navigation";
import TaskCard from "$lib/components/TaskCard.svelte";
import { type LanguageCode, t } from "$lib/i18n";
import { captureTaskEnterTransition } from "$lib/task-transition";

let { data } = $props();
let lang = $derived(data.language as LanguageCode);
let statusMap = $derived<Record<string, string>>(data.statusMap ?? {});

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
</script>

<div class="space-y-10">
	<!-- Title -->
	<section>
		<h1 class="text-3xl md:text-4xl text-gray-800 font-medium leading-tight">{t(lang, "translate.title")}</h1>
	</section>

	<!-- Templates -->
	<section>
		{#if data.templates.length === 0}
			<p class="text-muted-foreground">{t(lang, "translate.empty")}</p>
		{:else}
			<div class="grid gap-5 md:grid-cols-3">
				{#each data.templates as tpl}
					{@const status = statusMap[String(tpl.id)]}
					{@const isFinished = status === "submitted" || status === "evaluated"}
					<TaskCard
						id={tpl.id}
						title={tpl.titleBase}
						difficulty={tpl.difficulty}
						icon={Languages}
						shortObjective={tpl.shortObjectiveBase}
						href="/translate/{tpl.id}"
						buttonLabel={isFinished
							? 'View Result'
							: status === 'draft'
								? 'Continue'
								: t(lang, 'hall.enter')}
						status={isFinished ? null : status}
						{isFinished}
						flipped={flippedId === tpl.id}
						onflip={toggleFlip}
						onenter={enterTask}
					/>
				{/each}
			</div>
		{/if}
	</section>
</div>
