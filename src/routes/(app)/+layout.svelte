<script lang="ts">
import { browser } from "$app/environment";
import { base } from "$app/paths";
import { page } from "$app/state";
import { isQuestMenuPath } from "$lib/client/page-transition";
import ActionNotification from "$lib/components/ActionNotification.svelte";
import HomeMasthead from "$lib/components/HomeMasthead.svelte";
import Navbar from "$lib/components/Navbar.svelte";
import QuestMenuRoute from "$lib/components/quest-hall/QuestMenuRoute.svelte";
import type { ActionNotificationContent } from "$lib/notifications";

let { children, data } = $props();
let isHome = $derived(page.url.pathname === `${base}/`);
let questMenuRoute = $derived(isQuestMenuPath(page.url.pathname) ? page.data.questMenu : null);
let quotaNotification = $state<ActionNotificationContent | null>(null);

// Check if current route is a session page (fullscreen immersive mode)
let isSessionPage = $derived(page.url.pathname.includes("/session"));
let quotaWarning = $derived.by(() => {
	if (!data.trialQuota) return null;
	if (data.trialQuota.trialTokensLeft <= 0) return "depleted";
	if (data.trialQuota.trialTokensLeft / data.trialQuota.trialTokensTotal <= 0.1) return "low";
	return null;
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
</script>

<svelte:head>
	<meta name="robots" content="noindex, nofollow">
	{#if data.avatarUrl}
		<link rel="preload" as="image" href={data.avatarUrl}>
	{/if}
</svelte:head>

<div class="min-h-screen" class:app-shell={!isSessionPage}>
	{#if !isSessionPage}
		<Navbar user={data.user} avatarUrl={data.avatarUrl} />
	{/if}

	<ActionNotification notification={quotaNotification} durationMs={7000} />

	{#if isSessionPage}
		<main class="h-screen w-full">{@render children()}</main>
	{:else}
		<!-- The paper belongs to the snapshot: a transparent page would let the outgoing page show
		     through wherever this one has no content while the two sweep past each other. -->
		<div class="min-h-screen bg-background" style="view-transition-name: page-content">
			<!-- The extra bottom padding clears the narrow-screen bottom bar. -->
			<main class="mx-auto max-w-5xl px-4 pb-[calc(var(--app-bottom-nav-height)+2rem)] {isHome ? 'pt-0' : 'pt-8 nav:pt-24'}">
				{#if isHome}
					<HomeMasthead user={data.user} trialQuota={data.trialQuota} streak={data.streak} streakDayOffset={data.streakDayOffset} />
				{/if}
				{#if questMenuRoute}
					<QuestMenuRoute route={questMenuRoute} form={page.form} />
				{/if}
				{@render children()}
			</main>
		</div>
	{/if}
</div>

<style>
.app-shell {
	--app-bottom-nav-height: calc(3.275rem + max(0.5rem, env(safe-area-inset-bottom)) + 1px);
}
@media (min-width: 56.25rem) {
	.app-shell {
		--app-bottom-nav-height: 0px;
	}
}
</style>
