<script lang="ts">
import { base } from "$app/paths";
import WineGlassIcon from "$lib/components/WineGlassIcon.svelte";
</script>

<svelte:head>
	<title>Changelog · Libiamo</title>
	<meta name="description" content="A concise record of notable Libiamo releases and product changes.">
	<meta name="robots" content="index, follow">
</svelte:head>

<div lang="en" class="min-h-dvh bg-background text-foreground">
	<a
		href="#changelog-content"
		class="fixed left-4 top-3 z-50 -translate-y-20 rounded-md bg-foreground px-4 py-3 text-sm font-semibold text-background transition-transform focus:translate-y-0"
	>
		Skip to content
	</a>

	<header class="border-b border-border bg-background/95">
		<div class="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
			<a href="{base}/welcome" class="inline-flex min-h-11 items-center gap-2 rounded-sm focus-visible:ring-2 focus-visible:ring-ring">
				<WineGlassIcon width={32} height={32} />
				<span class="font-serif text-xl tracking-tight">Libiamo</span>
			</a>
			<a
				href="{base}/sign-in"
				class="inline-flex min-h-11 items-center rounded-full border border-border px-4 text-sm font-semibold transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
			>
				Sign in
			</a>
		</div>
	</header>

	<main id="changelog-content" class="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-20">
		<header class="border-b border-border pb-8">
			<p class="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Product record</p>
			<h1 class="mt-3 font-serif text-4xl leading-tight tracking-tight sm:text-5xl">Changelog</h1>
			<p class="mt-4 max-w-2xl leading-7 text-foreground/75">Notable improvements to Libiamo, listed from newest to oldest.</p>
		</header>

		<div class="divide-y divide-border">
			<article class="grid gap-4 py-10 sm:grid-cols-[9rem_minmax(0,1fr)]">
				<header>
					<p class="font-serif text-xl text-foreground">Unreleased</p>
					<p class="mt-1 text-sm text-muted-foreground">In development</p>
				</header>
				<div>
					<h2 class="font-serif text-2xl text-foreground">Public information</h2>
					<ul class="mt-3 list-disc space-y-2 pl-6 leading-7 text-foreground/85">
						<li>Added public Terms of Service and Privacy Policy pages.</li>
						<li>Added this user-facing changelog and connected all three pages from the welcome footer.</li>
					</ul>
				</div>
			</article>

			<article class="grid gap-4 py-10 sm:grid-cols-[9rem_minmax(0,1fr)]">
				<header>
					<p class="font-serif text-xl text-foreground">v0.3.1</p>
					<time datetime="2026-09-13" class="mt-1 block text-sm text-muted-foreground">September 13, 2026</time>
				</header>
				<div>
					<h2 class="font-serif text-2xl text-foreground">A public home and social sign-in</h2>
					<ul class="mt-3 list-disc space-y-2 pl-6 leading-7 text-foreground/85">
						<li>Added the public welcome page and improved fatal-error recovery.</li>
						<li>Added Google and GitHub authentication alongside email sign-in.</li>
						<li>Moved the production application origin to libiamo.net.</li>
					</ul>
				</div>
			</article>

			<article class="grid gap-4 py-10 sm:grid-cols-[9rem_minmax(0,1fr)]">
				<header>
					<p class="font-serif text-xl text-foreground">v0.3.0</p>
					<time datetime="2026-09-10" class="mt-1 block text-sm text-muted-foreground">September 10, 2026</time>
				</header>
				<div>
					<h2 class="font-serif text-2xl text-foreground">Quest Hall</h2>
					<ul class="mt-3 list-disc space-y-2 pl-6 leading-7 text-foreground/85">
						<li>Redesigned the production Quest Hall for daily, weekly, and translation work.</li>
						<li>Unified task and translation navigation around canonical detail routes.</li>
					</ul>
				</div>
			</article>
		</div>
	</main>

	<footer class="border-t border-border bg-muted/30">
		<div class="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
			<p>Libiamo · Language through living conversation</p>
			<nav aria-label="Public information" class="flex flex-wrap gap-x-5">
				<a
					href="{base}/welcome"
					class="inline-flex min-h-11 items-center rounded-sm underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring"
					>Home</a
				>
				<a
					href="{base}/terms"
					class="inline-flex min-h-11 items-center rounded-sm underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring"
					>Terms</a
				>
				<a
					href="{base}/privacy"
					class="inline-flex min-h-11 items-center rounded-sm underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring"
					>Privacy</a
				>
				<a
					href="{base}/changelog"
					aria-current="page"
					class="inline-flex min-h-11 items-center rounded-sm font-semibold text-foreground underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring"
					>Changelog</a
				>
			</nav>
		</div>
	</footer>
</div>
