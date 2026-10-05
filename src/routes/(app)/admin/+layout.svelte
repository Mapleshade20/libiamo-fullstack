<script lang="ts">
import { afterNavigate } from "$app/navigation";
import { base } from "$app/paths";
import { page } from "$app/state";
import Accordion from "$lib/components/common/Accordion.svelte";
import { activeNavIndex } from "$lib/components/shell/nav/nav-routes";
import { Badge } from "$lib/components/ui/badge";

let { children, data } = $props();
let toolsOpen = $state(false);
afterNavigate(() => {
	toolsOpen = false;
});
const sections = [
	{ href: `${base}/admin/tasks`, label: "Tasks" },
	{ href: `${base}/admin/lineups`, label: "Lineups" },
	{ href: `${base}/admin/reviews`, label: "Reviews" },
	{ href: `${base}/admin/announcements`, label: "Announcements" },
	{ href: `${base}/admin/lab`, label: "LLM Lab" },
];
const activeIndex = $derived(activeNavIndex(sections, page.url.pathname));
</script>

{#snippet navigation()}
	<nav aria-label="Administration" class="flex flex-col gap-1">
		{#each sections as section, index (section.href)}
			<a href={section.href} aria-current={activeIndex === index ? "page" : undefined} class="nav-item justify-between">
				{section.label}
				{#if section.href === `${base}/admin/reviews` && data.pendingReviewCount > 0}
					<Badge class="tabular-nums" aria-label={`${data.pendingReviewCount} pending reviews`}>{data.pendingReviewCount}</Badge>
				{/if}
			</a>
		{/each}
	</nav>
{/snippet}

<div class="grid min-w-0 gap-8 nav:grid-cols-[10rem_minmax(0,1fr)]">
	<aside aria-label="Admin tools">
		<div class="sticky top-24 hidden max-h-[calc(100dvh-8rem)] overflow-y-auto pt-2 nav:block">
			<p class="mb-2 px-3 text-xs font-medium text-muted-foreground">Administration</p>
			{@render navigation()}
		</div>
		<Accordion bind:open={toolsOpen} class="nav:hidden" title={`Administration · ${sections[activeIndex]?.label ?? "Tools"}`}>
			{@render navigation()}
		</Accordion>
	</aside>
	<div class="min-w-0">{@render children()}</div>
</div>
