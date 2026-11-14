<script lang="ts">
import Image from "@lucide/svelte/icons/image";
import Menu from "@lucide/svelte/icons/menu";
import { onMount, type Snippet } from "svelte";
import { goto } from "$app/navigation";
import { tip } from "$lib/components/common/tip";
import Sidebar from "$lib/components/shell/Sidebar.svelte";
import { shell } from "$lib/components/shell/shell.svelte";
import Week from "$lib/components/streak/Week.svelte";
import { director } from "$lib/components/tour/director.svelte";
import { account } from "$lib/demo/account.svelte";
import { tx } from "$lib/demo/app.svelte";
import { needsWelcome } from "$lib/demo/onboarding.svelte";

/* The app's pages: the bar beside them stays put between them (it is not part of the page's transition), the page
   fades through. The top bar holds the drawer's button on a phone, and the week. */
let { children }: { children: Snippet } = $props();
// Signed out, the way in (lib/demo/account.svelte.ts); a first visit sets up before anything else (onboarding.svelte.ts).
onMount(() => {
	if (!account.signedIn) goto("/sign-in", { replaceState: true });
	else if (needsWelcome()) goto("/welcome", { replaceState: true });
});
</script>

<!-- The tour remounts the pages when it starts, ends or changes chapter, so they read its stand-in data afresh. -->
{#key director.epoch}
	<Sidebar />
	<div class="page">
		<header class="top">
			<button
				type="button"
				class="menu-btn"
				id="menu-btn"
				aria-label={tx("sideOpen")}
				aria-expanded={shell.drawer}
				onclick={() => shell.setDrawer(true)}
			>
				<Menu class="size-[18px] text-muted-foreground" aria-hidden="true" />
				<span class="wordmark">Libiamo</span>
			</button>
			<span class="grow"></span>
			{#if shell.viewable}
				<button
					type="button"
					class="view-btn"
					aria-pressed={shell.viewing}
					use:tip={tx(shell.viewing ? "viewBack" : "viewScene")}
					onclick={(e) => {
						e.stopPropagation();
						shell.viewing = !shell.viewing;
					}}
				>
					<Image class="size-[18px]" aria-hidden="true" />
				</button>
			{/if}
			<div class="week" class:away={shell.viewing}><Week /></div>
		</header>
		{@render children()}
	</div>
{/key}

<style>
.page {
	position: relative;
	margin-inline-start: var(--side);
	min-height: 100dvh;
	transition: margin 250ms var(--ease-panel);
}
.top {
	position: relative;
	z-index: 3;
	display: flex;
	align-items: center;
	gap: 6px;
	min-height: 56px;
	padding: 10px max(16px, env(safe-area-inset-right)) 0 max(10px, env(safe-area-inset-left));
}
.grow {
	flex: 1;
}
.menu-btn {
	display: none;
	align-items: center;
	gap: 8px;
	height: 44px;
	padding: 0 12px 0 8px;
	border: 0;
	border-radius: 6px;
	background: none;
	color: var(--ink);
	cursor: pointer;
	transition: background-color 150ms;
}
.menu-btn:hover {
	background: var(--hover);
}
.menu-btn .wordmark {
	font-size: 30px;
}
@media (max-width: 899px) {
	.menu-btn {
		display: inline-flex;
	}
	:global(html[data-side]) .menu-btn .wordmark {
		view-transition-name: brand;
	}
}
.view-btn {
	display: inline-grid;
	place-items: center;
	width: 36px;
	height: 36px;
	border: 0;
	border-radius: 6px;
	background: transparent;
	color: var(--muted);
	cursor: pointer;
	transition:
		color 150ms,
		background-color 150ms,
		scale 150ms;
}
.view-btn:hover,
.view-btn[aria-pressed="true"] {
	color: var(--ink);
	background: var(--hover);
}
.view-btn:active {
	scale: 0.97;
}
.menu-btn:focus-visible,
.view-btn:focus-visible {
	outline: none;
	box-shadow: 0 0 0 3px color-mix(in oklab, var(--ring-c) 60%, transparent);
}
.week {
	transition:
		opacity 350ms var(--ease-panel),
		visibility 0s;
}
.week.away {
	opacity: 0;
	visibility: hidden;
	transition:
		opacity 250ms var(--ease-panel),
		visibility 0s 250ms;
}
@media (pointer: coarse) {
	.view-btn {
		width: 44px;
		height: 44px;
	}
}
</style>
