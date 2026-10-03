<script lang="ts">
import { base } from "$app/paths";
import { page } from "$app/state";
import SegmentedControl from "$lib/components/common/SegmentedControl.svelte";
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
	<div class="-mx-1 overflow-x-auto px-1 no-scrollbar">
		<SegmentedControl
			label="LLM Lab"
			value={String(activeIndex)}
			items={sections.map((section, index) => ({ value: String(index), label: section.label, href: section.href }))}
		/>
	</div>
	{@render children()}
</div>
