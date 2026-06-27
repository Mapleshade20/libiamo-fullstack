<script lang="ts">
import { tick } from "svelte";
import { browser } from "$app/environment";
import { page } from "$app/state";
import { clearTaskEnterTransition, markTaskEnterAnimating, taskEnterTransition } from "$lib/client/task-transition";
import ActionNotification from "$lib/components/ActionNotification.svelte";
import Navbar from "$lib/components/Navbar.svelte";
import type { ActionNotificationContent } from "$lib/notifications";

let { children, data } = $props();
let overlayStyle = $state("");
let overlayOpacity = $state(0);
let overlayVisible = $state(false);
let clearTimer: ReturnType<typeof setTimeout> | undefined = $state();
let fadeTimer: ReturnType<typeof setTimeout> | undefined = $state();
let quotaNotification = $state<ActionNotificationContent | null>(null);

// Check if current route is a session page (fullscreen immersive mode)
let isSessionPage = $derived(page.url.pathname.includes("/session"));
let quotaWarning = $derived.by(() => {
	if (!data.trialQuota) return null;
	if (data.trialQuota.trialTokensLeft <= 0) return "depleted";
	if (data.trialQuota.trialTokensLeft / data.trialQuota.trialTokensTotal <= 0.1) return "low";
	return null;
});

function rectStyle(top: number, left: number, width: number, height: number, radius: number) {
	return `top:${top}px;left:${left}px;width:${width}px;height:${height}px;border-radius:${radius}px;`;
}

function getNavBottom() {
	const nav = document.querySelector("[data-app-nav]") as HTMLElement | null;
	return nav?.getBoundingClientRect().bottom ?? 0;
}

function clearOverlayTimers() {
	if (fadeTimer) clearTimeout(fadeTimer);
	if (clearTimer) clearTimeout(clearTimer);
}

async function runTaskEnterOverlay() {
	const transition = $taskEnterTransition;
	if (!transition) return;

	clearOverlayTimers();
	markTaskEnterAnimating();
	overlayVisible = true;
	overlayOpacity = 1;
	overlayStyle = rectStyle(
		transition.sourceRect.top,
		transition.sourceRect.left,
		transition.sourceRect.width,
		transition.sourceRect.height,
		transition.sourceRadius,
	);

	await tick();

	requestAnimationFrame(() => {
		const navBottom = getNavBottom();
		overlayStyle = rectStyle(navBottom, 0, window.innerWidth, Math.max(window.innerHeight - navBottom, 0), 0);
	});

	fadeTimer = setTimeout(() => {
		overlayOpacity = 0;
	}, 420);

	clearTimer = setTimeout(() => {
		overlayVisible = false;
		clearTaskEnterTransition();
	}, 760);
}

$effect(() => {
	const transition = $taskEnterTransition;
	const pathname = page.url.pathname;

	if (!transition) return;
	if (transition.stage !== "captured") return;
	if (pathname !== new URL(transition.href).pathname) return;

	void runTaskEnterOverlay();
});

$effect(() => {
	if (!quotaWarning || !data.trialQuota) {
		quotaNotification = null;
		return;
	}
	if (!browser) return;

	const key = `trial-quota:${data.user.email}:${data.trialQuota.trialTokensTotal}:${quotaWarning}`;
	if (localStorage.getItem(key)) return;
	localStorage.setItem(key, "1");

	quotaNotification =
		quotaWarning === "depleted"
			? {
					variant: "error",
					title: "Trial AI balance depleted",
					message: "Add your own API key in Profile to continue using AI features.",
					key,
				}
			: {
					variant: "info",
					title: "Trial AI balance running low",
					message: "Your trial AI balance is below 10%. Add your own API key in Profile to avoid interruption.",
					key,
				};
});

$effect(() => {
	return () => {
		clearOverlayTimers();
	};
});
</script>

<svelte:head> <meta name="robots" content="noindex, nofollow"> </svelte:head>

<div class="min-h-screen">
	{#if !isSessionPage}
		<Navbar mode="app" user={data.user} avatarUrl={data.avatarUrl} trialQuota={data.trialQuota} />
	{/if}

	{#if overlayVisible && !isSessionPage}
		<div
			aria-hidden="true"
			class="pointer-events-none fixed z-40 border border-border bg-card shadow-[0_32px_90px_rgba(24,24,27,0.12)] transition-[top,left,width,height,border-radius,opacity] duration-[720ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
			style="{overlayStyle}opacity:{overlayOpacity};"
		></div>
	{/if}

	<ActionNotification notification={quotaNotification} durationMs={7000} />

	<main
		class={isSessionPage
			? "w-full h-screen"
			: "mx-auto max-w-5xl px-4 py-8 pt-24"}
		style={isSessionPage ? "" : "view-transition-name: page-content"}
	>
		{@render children()}
	</main>
</div>
