<script lang="ts">
import { base } from "$app/paths";
import { page } from "$app/state";
import { routePath } from "$lib/app/seo";
import WineGlassIcon from "$lib/components/shell/WineGlassIcon.svelte";

let { children } = $props();

const footerLinks = [
	{ label: "Home", path: "/welcome" },
	{ label: "Terms", path: "/terms" },
	{ label: "Privacy", path: "/privacy" },
	{ label: "Changelog", path: "/changelog" },
];
let currentPath = $derived(page.route.id && routePath(page.route.id));
</script>

<div lang="en" class="min-h-dvh bg-background text-foreground">
	<a
		href="#public-content"
		class="fixed left-4 top-3 z-50 -translate-y-20 rounded-md bg-foreground px-4 py-3 text-sm font-semibold text-background transition-transform focus:translate-y-0"
	>
		Skip to content
	</a>

	<header class="border-b border-border bg-background/95">
		<div class="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
			<a href="{base}/welcome" class="inline-flex min-h-11 items-center gap-2 rounded-sm focus-visible:ring-2 focus-visible:ring-ring">
				<WineGlassIcon width={32} height={32} />
				<span class="wordmark">Libiamo</span>
			</a>
			<a
				href="{base}/sign-in"
				class="inline-flex min-h-11 items-center rounded-full border border-border px-4 text-sm font-semibold transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
			>
				Sign in
			</a>
		</div>
	</header>

	<main id="public-content" class="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-20">{@render children()}</main>

	<footer class="border-t border-border bg-muted/30">
		<div class="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
			<p>Libiamo · Language through living conversation</p>
			<nav aria-label="Public information" class="flex flex-wrap gap-x-5">
				{#each footerLinks as link (link.path)}
					<a
						href="{base}{link.path}"
						aria-current={link.path === currentPath ? "page" : undefined}
						class="inline-flex min-h-11 items-center rounded-sm underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring aria-[current=page]:font-semibold aria-[current=page]:text-foreground"
						>{link.label}</a
					>
				{/each}
			</nav>
		</div>
	</footer>
</div>
