<script lang="ts">
import MarkdownRenderer from "../../MarkdownRenderer.svelte";

let {
	title,
	author,
	summary,
	rating,
	warning,
	fandoms,
	categories,
	relationships,
	characters,
	additionalTags,
	chapterTitle,
	excerpt,
}: {
	title: string;
	author: string;
	summary: string;
	rating: string;
	warning: string;
	fandoms: string[];
	categories: string[];
	relationships: string[];
	characters: string[];
	additionalTags: string[];
	chapterTitle: string;
	excerpt: string;
} = $props();

const groups = $derived([
	["Category", categories],
	["Fandoms", fandoms],
	["Relationships", relationships],
	["Characters", characters],
	["Additional Tags", additionalTags],
] as const);
</script>

<section class="mb-8 border border-[#ccc] bg-[#eee] p-2.5">
	<dl class="grid grid-cols-[120px_1fr] gap-x-4 gap-y-1 md:grid-cols-[150px_1fr]">
		<dt class="pt-1 text-right font-bold">Rating:</dt>
		<dd class="border-b border-[#ddd] pb-1"><span class="ao3-tag-link">{rating}</span></dd>
		<dt class="pt-1 text-right font-bold">Archive Warning:</dt>
		<dd class="border-b border-[#ddd] pb-1"><span class="ao3-tag-link">{warning}</span></dd>
		{#each groups as [ label, values ]}
			{#if values.length}
				<dt class="pt-1 text-right font-bold">{label}:</dt>
				<dd class="border-b border-[#ddd] pb-1"><span class="ao3-tag-link">{values.join(", ")}</span></dd>
			{/if}
		{/each}
	</dl>
</section>
<section class="mb-8 border-b border-[#ccc] pb-4 text-center">
	<h2 class="m-0 font-[Georgia,serif] text-3xl">{title}</h2>
	<h3 class="m-0 mt-1 text-lg font-normal"><span class="ao3-byline-link">{author}</span></h3>
	{#if summary}
		<div class="mx-auto mt-4 max-w-[800px] border border-[#ccc] bg-[#fdfdfd] p-4 text-left">
			<p class="font-bold">Summary:</p>
			<blockquote class="m-0"><MarkdownRenderer content={summary} /></blockquote>
		</div>
	{/if}
</section>
<section class="min-h-[220px] py-4 text-[15px]">
	<h3 class="mb-4 text-center font-[Georgia,serif] text-xl font-normal">{chapterTitle}</h3>
	<div class="mx-auto max-w-3xl leading-6"><MarkdownRenderer content={excerpt} /></div>
</section>
