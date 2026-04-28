<script lang="ts">
import Check from "@lucide/svelte/icons/check";
import Languages from "@lucide/svelte/icons/languages";
import { type LanguageCode, t } from "$lib/i18n";

let { data } = $props();
let lang = $derived(data.language as LanguageCode);
let statusMap = $derived<Record<string, string>>(data.statusMap ?? {});

let flippedId = $state<number | null>(null);

function toggleFlip(id: number) {
	flippedId = flippedId === id ? null : id;
}
</script>

{#snippet translateCard(tpl: typeof data.templates[0])}
	{@const status = statusMap[String(tpl.id)]}
	<div
		class="card-scene h-56 w-full cursor-pointer transition-transform duration-[400ms] ease-out hover:scale-[1.02] hover:-translate-y-1"
		role="button"
		tabindex="0"
		onclick={() => toggleFlip(tpl.id)}
		onkeydown={(e) => e.key === "Enter" && toggleFlip(tpl.id)}
	>
		<div class="card-inner w-full h-full" class:is-flipped={flippedId === tpl.id}>
			<!-- Front -->
			<div
				class="card-face absolute inset-0 bg-card rounded-2xl border border-border p-5 flex flex-col justify-between shadow-sm transition-shadow duration-500 hover:shadow-xl"
			>
				<div class="flex justify-between items-center">
					<div class="p-2.5 rounded-full bg-background/60 border border-border"><Languages size={20} strokeWidth={1} class="text-foreground" /></div>
					<div class="flex items-center gap-2">
						{#if status === "submitted" || status === "evaluated"}
							<span
								class="inline-flex items-center gap-1 rounded-full bg-green-100 text-green-700 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest"
							>
								<Check size={10} />
								Done
							</span>
						{:else if status === "draft"}
							<span
								class="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest"
							>
								Draft
							</span>
						{/if}
						<span class="flex gap-0.5">
							{#each Array.from({ length: 3 }, (_, i) => i < tpl.difficulty) as filled}
								<span
									class="inline-block h-2 w-2 rounded-full {filled
										? 'bg-muted-foreground'
										: 'bg-border'}"
								></span>
							{/each}
						</span>
					</div>
				</div>
				<h3 class="font-serif text-xl text-foreground leading-tight">{tpl.titleBase}</h3>
			</div>

			<!-- Back -->
			<div class="card-face card-back absolute inset-0 bg-card rounded-2xl border border-border p-5 flex flex-col justify-between shadow-xl">
				<div class="pt-1">
					<h4 class="font-serif text-base mb-3 text-foreground">{t(lang, "translate.title")}</h4>
					<p class="text-sm text-muted-foreground leading-5 line-clamp-4">{tpl.shortObjectiveBase ?? "—"}</p>
				</div>
				<div class="space-y-2.5">
					<a
						href="/translate/{tpl.id}"
						class="block w-full py-2 bg-foreground text-background rounded-lg text-xs font-medium tracking-wide text-center hover:opacity-90 transition-opacity shadow-md"
					>
						{status === "draft"
							? "Continue"
							: status === "submitted" || status === "evaluated"
								? "View Result"
								: t(lang, "hall.enter")}
					</a>
				</div>
			</div>
		</div>
	</div>
{/snippet}

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
					{@render translateCard(tpl)}
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
