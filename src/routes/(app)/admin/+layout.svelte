<script lang="ts">
import "$lib/components/admin/admin.css";
import BookOpenText from "@lucide/svelte/icons/book-open-text";
import ChevronDown from "@lucide/svelte/icons/chevron-down";
import Flag from "@lucide/svelte/icons/flag";
import Inbox from "@lucide/svelte/icons/inbox";
import Languages from "@lucide/svelte/icons/languages";
import Megaphone from "@lucide/svelte/icons/megaphone";
import Newspaper from "@lucide/svelte/icons/newspaper";
import ScrollText from "@lucide/svelte/icons/scroll-text";
import type { Snippet } from "svelte";
import { page } from "$app/state";
import FloatingPanel from "$lib/components/common/FloatingPanel.svelte";
import { CASES, FEEDBACK, SOURCES, SUGGESTIONS } from "$lib/demo/admin";

/*
 * The admin pages: what learners practise on (scenarios, issues, the names in translations), what they tell us (the
 * inbox) and what we tell them (announcements), and how sessions actually went (sessions, cases). One column of
 * sections beside the page when there is room, a menu above it when there is not. Counts are only for what waits on
 * the admin.
 */
let { children }: { children: Snippet } = $props();
const groups = [
	[
		{
			href: "/admin/scenarios",
			label: "Scenarios",
			icon: BookOpenText,
			count: Object.values(SOURCES)
				.flat()
				.filter((s) => s.state === "notes").length,
		},
		{ href: "/admin/issues", label: "Issues", icon: Newspaper, count: 0 },
		{ href: "/admin/names", label: "Names", icon: Languages, count: 0 },
	],
	[
		{
			href: "/admin/inbox",
			label: "Inbox",
			icon: Inbox,
			count: SUGGESTIONS.filter((s) => s.status === "pending").length + FEEDBACK.filter((f) => !f.done).length,
		},
		{ href: "/admin/announcements", label: "Announcements", icon: Megaphone, count: 0 },
	],
	[
		{ href: "/admin/sessions", label: "Sessions", icon: ScrollText, count: 0 },
		{ href: "/admin/cases", label: "Cases", icon: Flag, count: CASES.filter((c) => c.status === "open").length },
	],
];
const all = groups.flat();
const current = $derived(all.find((s) => page.url.pathname === s.href || page.url.pathname.startsWith(`${s.href}/`)));
let menuOpen = $state(false);
</script>

<svelte:head><title>{current?.label ?? "Admin"} · Admin</title></svelte:head>

{#snippet sections(close?: () => void)}
	{#each groups as g, i (i)}
		{#if i}
			<div class="sep" role="presentation"></div>
		{/if}
		{#each g as s (s.href)}
			<a class="item" href={s.href} aria-current={current === s ? "page" : undefined} onclick={close}>
				{#if current === s && !close}
					<span class="cur" aria-hidden="true"></span>
				{/if}
				<s.icon class="size-4" aria-hidden="true" />
				<span class="l">{s.label}</span>
				{#if s.count}
					<span class="count" role="img" aria-label="{s.count} waiting">{s.count}</span>
				{/if}
			</a>
		{/each}
	{/each}
{/snippet}

<div class="adm">
	<div class="frame">
		<nav class="adm-nav" aria-label="Admin">
			<p class="kicker">Admin</p>
			{@render sections()}
		</nav>
		<div class="adm-pick">
			<FloatingPanel bind:open={menuOpen} label="Admin sections" align="start" role="menu" plainTrigger triggerClass="pick" class="w-60">
				{#snippet trigger()}
					<span class="contents" role="presentation">
						{#if current}
							<current.icon class="size-4 text-muted-foreground" aria-hidden="true" />
						{/if}
						<span>Admin · {current?.label ?? ""}</span>
						<ChevronDown class="size-4 text-muted-foreground" aria-hidden="true" />
					</span>
				{/snippet}
				<div class="menu">{@render sections(() => (menuOpen = false))}</div>
			</FloatingPanel>
		</div>
		<div class="content">{@render children()}</div>
	</div>
</div>

<style>
.adm {
	container-type: inline-size;
	width: min(1180px, 100% - 40px);
	margin: 0 auto;
	padding: clamp(12px, 4vh, 36px) 0 96px;
}
.frame {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	gap: 18px;
}
.adm-nav {
	display: none;
}
@container (min-width: 880px) {
	.frame {
		grid-template-columns: 176px minmax(0, 1fr);
		gap: 40px;
	}
	.adm-nav {
		position: sticky;
		top: 24px;
		display: flex;
		flex-direction: column;
		gap: 2px;
		align-self: start;
	}
	.adm-pick {
		display: none;
	}
}
.kicker {
	margin: 6px 10px 8px;
	font-size: 12.5px;
	font-weight: 500;
	color: var(--muted);
}
.sep {
	height: 1px;
	margin: 8px 10px;
	background: var(--line-soft);
}
.item {
	position: relative;
	display: flex;
	align-items: center;
	gap: 10px;
	height: 36px;
	padding: 0 10px;
	border-radius: 6px;
	color: var(--ink-2);
	font-size: 14px;
	text-decoration: none;
	transition:
		color 150ms,
		background-color 150ms,
		box-shadow 250ms var(--ease-panel);
}
.item :global(svg) {
	color: var(--muted);
	transition: color 150ms;
}
.item:hover {
	background: var(--hover);
	color: var(--ink);
}
/* The current section is a sheet lying on top, as in the app's own bar; between admin pages it slides to the new row
   while the column itself stays put (admin.css names both for the trip). */
.item[aria-current="page"] {
	color: var(--ink);
}
.adm-nav .cur {
	position: absolute;
	inset: 0;
	z-index: -1;
	border-radius: inherit;
	background: var(--raised);
	box-shadow:
		0 0 0 1px var(--edge),
		var(--paper-lift);
}
.adm-nav .item {
	isolation: isolate;
}
.item[aria-current="page"] :global(svg) {
	color: var(--ink);
}
.item:focus-visible {
	outline: none;
	box-shadow: 0 0 0 3px color-mix(in oklab, var(--ring-c) 60%, transparent);
}
.l {
	flex: 1;
	min-width: 0;
}
.count {
	min-width: 20px;
	height: 20px;
	padding: 0 6px;
	border-radius: 10px;
	background: color-mix(in srgb, var(--accent-c) 16%, transparent);
	color: var(--ink);
	font-size: 12px;
	line-height: 20px;
	text-align: center;
	font-variant-numeric: tabular-nums;
}
.adm-pick :global(.pick) {
	display: inline-flex;
	align-items: center;
	gap: 8px;
	height: 40px;
	padding: 0 12px;
	border-radius: 6px;
	border: 1px solid var(--edge);
	background: var(--raised);
	box-shadow: var(--paper-lift);
	color: var(--ink);
	font-size: 14px;
	cursor: pointer;
}
.menu {
	display: flex;
	flex-direction: column;
	gap: 2px;
	padding: 4px;
}
.menu .item[aria-current="page"] {
	box-shadow: none;
	background: var(--hover);
}
.content {
	min-width: 0;
}
@media (pointer: coarse) {
	.item {
		height: 44px;
	}
}
</style>
