<script lang="ts">
import ArrowLeft from "@lucide/svelte/icons/arrow-left";
import Clock from "@lucide/svelte/icons/clock";
import Gem from "@lucide/svelte/icons/gem";
import Star from "@lucide/svelte/icons/star";
import { marked } from "marked";
import { Badge } from "$lib/components/ui/badge";
import { Button } from "$lib/components/ui/button";
import { INTERACTION_TYPE_LABELS, UI_VARIANT_LABELS } from "$lib/constants";

let { data } = $props();
let task = $derived(data.task);

const objectives = $derived(task.objectives ?? []);

function difficultyLabel(level: number): string {
	return ["Beginner", "Intermediate", "Advanced"][level - 1] ?? `Level ${level}`;
}
</script>

<div class="fixed inset-0 bg-card"></div>

<div class="task-stagger relative z-10 mx-auto max-w-2xl flex flex-col min-h-[calc(100vh-8rem)]">
	<a href="/" class="group flex w-fit items-center gap-2 text-muted-foreground transition-colors hover:text-foreground">
		<ArrowLeft size={18} strokeWidth={1.5} class="transition-transform group-hover:-translate-x-1" />
		<span class="text-sm font-medium uppercase tracking-wide">Return to Quest Hall</span>
	</a>

	<div class="mt-12 flex-1 flex flex-col">
		<div>
			<div class="mb-4 flex flex-wrap items-center gap-2">
				<Badge variant="secondary" class="text-[10px] font-bold uppercase tracking-widest">
					{UI_VARIANT_LABELS[task.templateUi as keyof typeof UI_VARIANT_LABELS] ?? task.templateUi}
				</Badge>
				<Badge variant="outline" class="text-[10px] font-bold uppercase tracking-widest">
					{INTERACTION_TYPE_LABELS[task.templateInteractionType as keyof typeof INTERACTION_TYPE_LABELS] ?? task.templateInteractionType}
				</Badge>
				<span class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground"> {difficultyLabel(task.templateDifficulty)} </span>
			</div>
			<h1 class="font-serif text-3xl md:text-5xl text-foreground leading-tight">{task.title}</h1>
		</div>

		{#if task.description}
			<p class="mt-8 max-w-xl text-base font-light leading-relaxed text-muted-foreground">{task.description}</p>
		{/if}

		{#if objectives.length > 0}
			<div class="mt-8">
				<h2 class="mb-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">Objectives</h2>
				<ol class="list-inside list-decimal space-y-1.5 text-base font-light leading-relaxed text-muted-foreground max-w-xl">
					{#each objectives as obj}
						<li>{obj}</li>
					{/each}
				</ol>
			</div>
		{/if}

		{#if task.materialsMd}
			<div class="mt-10">
				<h2 class="mb-4 text-xs font-bold uppercase tracking-widest text-muted-foreground">Background Material</h2>
				<div class="prose prose-neutral max-w-xl text-base font-light leading-relaxed">{@html marked.parse(task.materialsMd)}</div>
			</div>
		{/if}

		<div class="mt-auto pt-12 pb-4">
			<div class="h-px w-full bg-border mb-6"></div>
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-4 text-sm text-muted-foreground">
					<span class="flex items-center gap-1.5">
						<Star size={14} strokeWidth={1.5} />
						{task.pointReward}
						pts
					</span>
					<span class="flex items-center gap-1.5">
						<Gem size={14} strokeWidth={1.5} />
						{task.gemReward}
						gems
					</span>
					{#if task.estimatedWords}
						<span class="flex items-center gap-1.5"> <Clock size={14} strokeWidth={1.5} />~{task.estimatedWords} words </span>
					{/if}
				</div>
				<Button disabled class="px-8">Start Practice</Button>
			</div>
		</div>
	</div>
</div>
