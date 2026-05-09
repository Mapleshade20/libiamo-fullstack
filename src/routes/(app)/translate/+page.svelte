<script lang="ts">
import Languages from "@lucide/svelte/icons/languages";
import TaskCard from "$lib/components/TaskCard.svelte";
import { type LanguageCode, t } from "$lib/i18n";

let { data } = $props();
let lang = $derived(data.language as LanguageCode);
let statusMap = $derived<Record<string, string>>(data.statusMap ?? {});

let flippedId = $state<number | null>(null);

function toggleFlip(id: number) {
	flippedId = flippedId === id ? null : id;
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
					<TaskCard
						id={tpl.id}
						title={tpl.titleBase}
						difficulty={tpl.difficulty}
						icon={Languages}
						shortObjective={tpl.shortObjectiveBase}
						href="/translate/{tpl.id}"
						buttonLabel={status === 'draft'
							? 'Continue'
							: status === 'submitted' || status === 'evaluated'
								? 'View Result'
								: t(lang, 'hall.enter')}
						{status}
						flipped={flippedId === tpl.id}
						onflip={toggleFlip}
					/>
				{/each}
			</div>
		{/if}
	</section>
</div>
