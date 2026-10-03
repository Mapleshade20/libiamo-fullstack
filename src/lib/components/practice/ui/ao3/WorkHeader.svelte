<script lang="ts">
import MarkdownRenderer from "$lib/components/common/MarkdownRenderer.svelte";
import type { describeWork } from "./helpers";

let { work }: { work: ReturnType<typeof describeWork> } = $props();
</script>

<section class="mb-8 border border-[#ccc] bg-[#eee] p-2.5">
	<dl class="grid grid-cols-[120px_1fr] gap-x-4 gap-y-1 md:grid-cols-[150px_1fr]">
		{#each work.tags as [ label, values ] (label)}
			<dt class="pt-1 text-right font-bold">{label}:</dt>
			<dd class="border-b border-[#ddd] pb-1">
				<ul class="work-tags m-0 list-none p-0">
					{#each values as value}
						<li><span>{value}</span></li>
					{/each}
				</ul>
			</dd>
		{/each}
	</dl>
</section>

<section class="mb-8 border-b border-[#ccc] pb-4 text-center">
	<h1 class="m-0 font-[Georgia,serif] text-3xl font-normal">{work.title}</h1>
	<p class="m-0 mt-1 text-lg">{work.author}</p>
	{#if work.summary}
		<div class="mx-auto mt-4 max-w-[800px] border border-[#ccc] bg-[#fdfdfd] p-4 text-left">
			<p class="font-bold">Summary:</p>
			<blockquote class="m-0"><MarkdownRenderer content={work.summary} /></blockquote>
		</div>
	{/if}
</section>

<section class="min-h-[220px] py-4 text-[15px]">
	<h2 class="mb-4 text-center font-[Georgia,serif] text-xl font-normal">{work.chapterTitle}</h2>
	<div class="mx-auto max-w-3xl leading-6"><MarkdownRenderer content={work.excerpt} /></div>
</section>

<style>
/* Tags read as AO3's dotted tag links but are not links here. */
.work-tags li {
	display: inline;
}
.work-tags li:not(:last-child)::after {
	content: ", ";
}
.work-tags span {
	border-bottom: 1px dotted currentColor;
	color: #111;
}
</style>
