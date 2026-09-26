<script lang="ts">
import { afterNavigate } from "$app/navigation";
import { base } from "$app/paths";
import { page } from "$app/state";
import Accordion from "$lib/components/common/Accordion.svelte";
import { activeNavIndex } from "$lib/components/shell/nav/nav-routes";

let { children, data } = $props();
let toolsOpen = $state(false);
afterNavigate(() => {
	toolsOpen = false;
});
const sections = [
	{ href: `${base}/admin/tasks`, label: "Tasks" },
	{ href: `${base}/admin/lineups`, label: "Lineups" },
	{ href: `${base}/admin/reviews`, label: "Reviews" },
	{ href: `${base}/admin/lab`, label: "LLM Lab" },
];
const activeIndex = $derived(activeNavIndex(sections, page.url.pathname));
</script>

{#snippet navigation()}
	<nav aria-label="Administration" class="flex flex-col gap-1">
		{#each sections as section, index (section.href)}
			<a
				href={section.href}
				aria-current={activeIndex === index ? "page" : undefined}
				class="flex min-h-11 items-center justify-between gap-3 rounded-md px-3 py-2 text-sm outline-offset-4 focus-visible:outline-2 focus-visible:outline-ring {activeIndex === index ? 'bg-secondary text-foreground font-medium' : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground'}"
			>
				{section.label}
				{#if section.href === `${base}/admin/reviews` && data.pendingReviewCount > 0}
					<span class="rounded-full bg-foreground/10 px-2 py-0.5 text-xs tabular-nums" aria-label={`${data.pendingReviewCount} pending reviews`}
						>{data.pendingReviewCount}</span
					>
				{/if}
			</a>
		{/each}
	</nav>
{/snippet}

<div class="grid min-w-0 gap-8 nav:grid-cols-[10rem_minmax(0,1fr)]">
	<aside aria-label="Admin tools">
		<div class="sticky top-24 hidden max-h-[calc(100dvh-8rem)] overflow-y-auto nav:block">
			<p class="mb-5 px-3 font-serif text-xl">Administration</p>
			{@render navigation()}
		</div>
		<Accordion bind:open={toolsOpen} class="bg-card/50 nav:hidden" title={`Administration · ${sections[activeIndex]?.label ?? "Tools"}`}>
			{@render navigation()}
		</Accordion>
	</aside>
	<div class="min-w-0">{@render children()}</div>
</div>
