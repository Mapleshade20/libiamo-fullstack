<script lang="ts">
import { base } from "$app/paths";
import { type GuideLanguage, LAB_GUIDE } from "./guide-content";

let { data } = $props();
const guide = $derived(LAB_GUIDE[data.language]);

const LANGUAGES: Array<{ code: GuideLanguage; label: string; lang: string }> = [
	{ code: "zh", label: "中文", lang: "zh-CN" },
	{ code: "en", label: "English", lang: "en" },
];

/** Splits `code` spans out of guide text so they render as code, never as HTML. */
function segments(text: string): Array<{ code: boolean; text: string }> {
	return text.split("`").map((part, index) => ({ code: index % 2 === 1, text: part }));
}
</script>

<svelte:head> <title>{guide.title} · LLM Lab · Libiamo</title> </svelte:head>

{#snippet rich(text: string)}
	{#each segments(text) as segment}
		{#if segment.code}
			<code class="rounded bg-secondary px-1 py-px font-mono text-[0.85em]">{segment.text}</code>
		{:else}
			{segment.text}
		{/if}
	{/each}
{/snippet}

<article class="space-y-10" lang={LANGUAGES.find((language) => language.code === data.language)?.lang}>
	<header class="space-y-4">
		<div class="flex flex-wrap items-start justify-between gap-4">
			<h1 class="text-3xl">{guide.title}</h1>
			<nav aria-label="Language" class="flex rounded-lg border border-border p-1 text-sm">
				{#each LANGUAGES as language}
					<a
						href="{base}/admin/lab?lang={language.code}"
						lang={language.lang}
						aria-current={data.language === language.code ? "true" : undefined}
						data-sveltekit-noscroll
						data-sveltekit-replacestate
						class="inline-flex min-h-11 min-w-16 items-center justify-center rounded-md px-3 outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring {data.language === language.code ? 'bg-secondary font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'}"
					>
						{language.label}
					</a>
				{/each}
			</nav>
		</div>
		<p class="max-w-3xl text-base leading-relaxed text-muted-foreground">{guide.lead}</p>
	</header>

	<div class="grid gap-10 nav:grid-cols-[13rem_minmax(0,1fr)]">
		<nav aria-labelledby="guide-contents" class="nav:sticky nav:top-24 nav:self-start">
			<h2 id="guide-contents" class="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{guide.contents}</h2>
			<ol class="space-y-0.5 text-sm">
				{#each guide.sections as section, index}
					<li>
						<a
							href="#{section.id}"
							class="flex min-h-11 items-center gap-2 rounded-md px-2 text-muted-foreground hover:bg-secondary/60 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
						>
							<span class="w-5 shrink-0 text-xs tabular-nums">{index + 1}</span>{section.title}
						</a>
					</li>
				{/each}
			</ol>
		</nav>

		<div class="max-w-3xl space-y-12">
			{#each guide.sections as section, index}
				<section id={section.id} aria-labelledby={`${section.id}-heading`} class="scroll-mt-24 space-y-4">
					<h2 id={`${section.id}-heading`} class="font-serif text-2xl">
						<span class="mr-2 text-muted-foreground tabular-nums">{index + 1}</span>{section.title}
					</h2>
					{#each section.blocks as block}
						{#if block.kind === "p"}
							<p class="leading-relaxed">{@render rich(block.text)}</p>
						{:else if block.kind === "note"}
							<p class="rounded-md border-l-2 border-[#c9b98f] bg-[#f6efe0] px-4 py-3 text-sm leading-relaxed">{@render rich(block.text)}</p>
						{:else if block.kind === "steps"}
							<ol class="space-y-2.5">
								{#each block.items as item, step}
									<li class="flex gap-3 leading-relaxed">
										<span
											class="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-border text-xs tabular-nums"
											aria-hidden="true"
											>{step + 1}</span
										>
										<span class="min-w-0">{@render rich(item)}</span>
									</li>
								{/each}
							</ol>
						{:else}
							<ul class="list-disc space-y-2.5 pl-5 leading-relaxed marker:text-muted-foreground">
								{#each block.items as item}
									<li>{@render rich(item)}</li>
								{/each}
							</ul>
						{/if}
					{/each}
				</section>
			{/each}
		</div>
	</div>
</article>
