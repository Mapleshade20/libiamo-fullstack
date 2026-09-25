<script lang="ts">
import { base } from "$app/paths";
import { page } from "$app/state";
import { activeNavIndex } from "$lib/components/shell/nav/nav-routes";

let { children } = $props();

const sections = [
	{ href: `${base}/admin/lab`, label: "Guide · 指南", exact: true },
	{ href: `${base}/admin/lab/traces`, label: "Traces" },
	{ href: `${base}/admin/lab/playground`, label: "Playground" },
	{ href: `${base}/admin/lab/datasets`, label: "Datasets", sectionPaths: [`${base}/admin/lab/runs`] },
	{ href: `${base}/admin/lab/overrides`, label: "My overrides" },
];
const activeIndex = $derived(activeNavIndex(sections, page.url.pathname));
</script>

<div class="space-y-6">
	<nav aria-label="LLM Lab" class="flex flex-wrap gap-1 border-b border-border pb-2">
		{#each sections as section, index (section.href)}
			<a
				href={section.href}
				aria-current={activeIndex === index ? "page" : undefined}
				class="inline-flex min-h-11 items-center rounded-md px-3 text-sm outline-offset-4 focus-visible:outline-2 focus-visible:outline-ring {activeIndex === index ? 'bg-secondary font-medium text-foreground' : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground'}"
			>
				{section.label}
			</a>
		{/each}
	</nav>
	{@render children()}
</div>
