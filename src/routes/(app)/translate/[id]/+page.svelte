<script lang="ts">
import ArrowLeft from "@lucide/svelte/icons/arrow-left";
import Clock from "@lucide/svelte/icons/clock";
import Gem from "@lucide/svelte/icons/gem";
import Languages from "@lucide/svelte/icons/languages";
import Star from "@lucide/svelte/icons/star";
import { Badge } from "$lib/components/ui/badge";
import { Button } from "$lib/components/ui/button";
import { type LanguageCode, t } from "$lib/i18n";
import { renderMarkdown } from "$lib/markdown";

let { data } = $props();
let tpl = $derived(data.template);
let lang = $derived(tpl.language as LanguageCode);

// passages is string[][] (paragraphs → sentences)
type Passage = string[][];
const passages: Passage = (tpl.passages as Passage) ?? [];

function difficultyLabel(level: number): string {
	return ["Beginner", "Intermediate", "Advanced"][level - 1] ?? `Level ${level}`;
}
</script>

<div class="fixed inset-0 bg-card"></div>

<div class="relative z-10 mx-auto max-w-2xl flex flex-col min-h-[calc(100vh-8rem)]">
	<a href="/translate" class="group flex w-fit items-center gap-2 text-muted-foreground transition-colors hover:text-foreground">
		<ArrowLeft size={18} strokeWidth={1.5} class="transition-transform group-hover:-translate-x-1" />
		<span class="text-sm font-medium uppercase tracking-wide">{t(lang, "common.back")}</span>
	</a>

	<div class="mt-12 flex-1 flex flex-col">
		<!-- Header -->
		<div>
			<div class="mb-4 flex flex-wrap items-center gap-2">
				<Badge variant="secondary" class="text-[10px] font-bold uppercase tracking-widest">
					<Languages size={12} class="mr-1" />
					Translation
				</Badge>
				<span class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground"> {difficultyLabel(tpl.difficulty)} </span>
			</div>
			<h1 class="font-serif text-3xl md:text-5xl text-foreground leading-tight">{tpl.title}</h1>
		</div>

		{#if tpl.description}
			<p class="mt-8 max-w-xl text-base font-light leading-relaxed text-muted-foreground">{tpl.description}</p>
		{/if}

		<!-- Source Article (Passages) -->
		{#if passages.length > 0}
			<div class="mt-10">
				<h2 class="mb-4 text-xs font-bold uppercase tracking-widest text-muted-foreground">Source Text</h2>
				<div class="space-y-4 max-w-xl">
					{#each passages as paragraph, pi}
						<p class="text-base font-light leading-relaxed text-foreground">
							{#each paragraph as sentence, si}
								<span class="cursor-pointer rounded px-0.5 transition-colors hover:bg-foreground/10" title="Click to translate"
									>{sentence}{si < paragraph.length - 1 ? " " : ""}</span
								>
							{/each}
						</p>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Background Material -->
		{#if tpl.materialsMd}
			<div class="mt-10">
				<h2 class="mb-4 text-xs font-bold uppercase tracking-widest text-muted-foreground">Background Material</h2>
				<div class="prose prose-neutral max-w-xl text-base font-light leading-relaxed">{@html renderMarkdown(tpl.materialsMd)}</div>
			</div>
		{/if}

		<!-- Footer -->
		<div class="mt-auto pt-12 pb-4">
			<div class="h-px w-full bg-border mb-6"></div>
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-4 text-sm text-muted-foreground">
					<span class="flex items-center gap-1.5">
						<Star size={14} strokeWidth={1.5} />
						{tpl.pointReward}
						pts
					</span>
					<span class="flex items-center gap-1.5">
						<Gem size={14} strokeWidth={1.5} />
						{tpl.gemReward}
						gems
					</span>
					{#if tpl.estimatedWords}
						<span class="flex items-center gap-1.5"> <Clock size={14} strokeWidth={1.5} />~{tpl.estimatedWords} words </span>
					{/if}
				</div>
				<Button disabled class="px-8">Start Translation</Button>
			</div>
		</div>
	</div>
</div>
