<script lang="ts">
import { browser } from "$app/environment";
import { page } from "$app/state";
import { isQuestMenuPath } from "$lib/client/page-transition";
import ActionNotification from "$lib/components/ActionNotification.svelte";
import Navbar from "$lib/components/Navbar.svelte";
import QuestMenuRoute from "$lib/components/quest-hall/QuestMenuRoute.svelte";
import { isLanguageCode } from "$lib/constants";
import type { ActionNotificationContent } from "$lib/notifications";

let { children, data } = $props();
let questMenuRoute = $derived(isQuestMenuPath(page.url.pathname) ? page.data.questMenu : null);
let quotaNotification = $state<ActionNotificationContent | null>(null);

$effect(() => {
	if (!browser) return;
	document.documentElement.lang = isLanguageCode(data.user.activeLanguage) ? data.user.activeLanguage : "en";
});

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

<svelte:head> <meta name="robots" content="noindex, nofollow"> </svelte:head>

<div class="min-h-screen">
	{#if !isSessionPage}
		<Navbar mode="app" user={data.user} avatarUrl={data.avatarUrl} trialQuota={data.trialQuota} />
	{/if}

	<ActionNotification notification={quotaNotification} durationMs={7000} />

	{#if isSessionPage}
		<main class="h-screen w-full">{@render children()}</main>
	{:else}
		<div class="min-h-screen" style="view-transition-name: page-content">
			<main class="mx-auto max-w-5xl px-4 py-8 pt-24">
				{#if questMenuRoute}
					<QuestMenuRoute route={questMenuRoute} form={page.form} />
				{/if}
				{@render children()}
			</main>
		</div>
	{/if}
</div>
