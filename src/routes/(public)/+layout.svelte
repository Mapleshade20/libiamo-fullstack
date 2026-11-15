<script lang="ts">
import type { Snippet } from "svelte";
import { account } from "#lib/account/account.svelte.ts";
import { page } from "$app/state";

/*
 * The pages anyone may read, signed in or not: what Libiamo is, the terms, the privacy policy, the changelog. They are
 * in English whatever the page around them speaks, as one plain column with the way into the app at the top.
 */
let { children }: { children: Snippet } = $props();
const LINKS = [
	{ href: "/about", label: "About" },
	{ href: "/terms", label: "Terms of Service" },
	{ href: "/privacy", label: "Privacy Policy" },
	{ href: "/changelog", label: "Changelog" },
];
</script>

<div class="doc-page" lang="en">
	<a class="skip" href="#doc">Skip to content</a>
	<header class="top">
		<a class="wordmark" href={account.signedIn ? "/" : "/about"}>Libiamo</a>
		<a class="enter" href={account.signedIn ? "/" : "/sign-in"}>{account.signedIn ? "Open Libiamo" : "Sign in"}</a>
	</header>
	<main id="doc" class="doc">{@render children()}</main>
	<footer class="foot">
		<nav aria-label="Documents">
			{#each LINKS as l (l.href)}
				<a href={l.href} aria-current={page.url.pathname === l.href ? "page" : undefined}>{l.label}</a>
			{/each}
		</nav>
	</footer>
</div>

<style>
.doc-page {
	min-height: 100dvh;
	display: flex;
	flex-direction: column;
	background: var(--bg);
	color: var(--ink);
}
.skip {
	position: fixed;
	top: 10px;
	left: 12px;
	z-index: 10;
	translate: 0 -80px;
	padding: 8px 14px;
	border-radius: 6px;
	background: var(--ink);
	color: var(--bg);
	font-weight: 600;
}
.skip:focus-visible {
	translate: 0 0;
}
.top {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 16px;
	padding: 14px max(20px, env(safe-area-inset-right)) 10px max(20px, env(safe-area-inset-left));
}
.enter {
	display: inline-flex;
	align-items: center;
	min-height: 36px;
	padding: 0 14px;
	border: 1px solid var(--edge);
	border-radius: 6px;
	background: var(--raised-face);
	box-shadow: var(--raised-shadow);
	color: var(--ink);
	font-size: 14px;
	font-weight: 500;
	text-decoration: none;
}
.enter:hover {
	background: var(--hover);
}
@media (pointer: coarse) {
	.enter {
		min-height: 44px;
	}
}
.doc {
	flex: 1;
	width: min(720px, 100% - 40px);
	margin: 0 auto;
	padding: clamp(24px, 6vh, 64px) 0 72px;
}
.doc :global(h1) {
	margin: 0;
	font: 400 clamp(34px, 5vw, 44px) / 1.15 var(--font-serif-stack);
	letter-spacing: -0.01em;
}
.doc :global(.updated) {
	margin: 10px 0 0;
	color: var(--muted);
	font-size: 14px;
}
.doc :global(.lede) {
	margin: 14px 0 0;
	color: var(--muted);
}
.doc :global(section) {
	margin-top: 40px;
}
.doc :global(h2) {
	margin: 0 0 10px;
	font: 400 24px / 1.3 var(--font-serif-stack);
}
.doc :global(p),
.doc :global(li) {
	color: color-mix(in oklab, var(--ink) 85%, transparent);
	line-height: 1.7;
}
.doc :global(p) {
	margin: 10px 0 0;
}
.doc :global(ul) {
	margin: 10px 0 0;
	padding-inline-start: 22px;
	list-style: disc;
}
.doc :global(li::marker) {
	color: var(--muted);
}
.doc :global(li + li) {
	margin-top: 6px;
}
.doc :global(:is(p, li) a) {
	color: var(--ink);
	text-decoration: underline;
	text-decoration-color: var(--line);
	text-underline-offset: 3px;
}
.doc :global(:is(p, li) a:hover) {
	text-decoration-color: var(--ink);
}
.foot {
	border-top: 1px solid var(--line-soft);
	padding: 22px max(20px, env(safe-area-inset-right)) calc(22px + env(safe-area-inset-bottom)) max(20px, env(safe-area-inset-left));
}
.foot nav {
	display: flex;
	flex-wrap: wrap;
	justify-content: center;
	gap: 6px 22px;
}
.foot a {
	display: inline-flex;
	align-items: center;
	min-height: 36px;
	color: var(--muted);
	font-size: 14px;
	text-decoration: none;
}
.foot a:hover,
.foot a[aria-current="page"] {
	color: var(--ink);
}
</style>
