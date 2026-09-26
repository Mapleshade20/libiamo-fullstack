<script lang="ts">
import ArrowLeft from "@lucide/svelte/icons/arrow-left";
import ArrowRight from "@lucide/svelte/icons/arrow-right";
import { base } from "$app/paths";

type PageKey = "terms" | "privacy" | "changelog";

let { current }: { current: PageKey } = $props();

const pages = [
	{ key: "terms", label: "Terms of Service", path: "/terms" },
	{ key: "privacy", label: "Privacy Policy", path: "/privacy" },
	{ key: "changelog", label: "Changelog", path: "/changelog" },
] as const satisfies readonly { key: PageKey; label: string; path: string }[];

const currentIndex = $derived(pages.findIndex((page) => page.key === current));
const previous = $derived(pages[(currentIndex + pages.length - 1) % pages.length]);
const next = $derived(pages[(currentIndex + 1) % pages.length]);
</script>

<nav aria-label="Public pages" class="flex items-center justify-between gap-3 text-sm">
	<a
		href="{base}{previous.path}"
		class="group inline-flex min-h-11 items-center gap-2 rounded-full px-1 font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
	>
		<ArrowLeft size={16} aria-hidden="true" class="transition-transform group-hover:-translate-x-0.5" />
		<span>{previous.label}</span>
	</a>
	<a
		href="{base}{next.path}"
		class="group inline-flex min-h-11 items-center gap-2 rounded-full px-1 font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
	>
		<span>{next.label}</span>
		<ArrowRight size={16} aria-hidden="true" class="transition-transform group-hover:translate-x-0.5" />
	</a>
</nav>
