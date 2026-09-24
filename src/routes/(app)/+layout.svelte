<script lang="ts">
import { browser, dev } from "$app/environment";
import { base } from "$app/paths";
import { page } from "$app/state";
import { isQuestMenuPath } from "$lib/client/page-transition";
import ActionNotification from "$lib/components/common/ActionNotification.svelte";
import type { ActionNotificationContent } from "$lib/components/common/notifications";
import QuestMenuRoute from "$lib/components/quest-hall/QuestMenuRoute.svelte";
import HomeMasthead from "$lib/components/shell/HomeMasthead.svelte";
import Navbar from "$lib/components/shell/Navbar.svelte";
import { provideStreakPresentation } from "$lib/components/streak/presentation-state.svelte";
import StreakHost from "$lib/components/streak/StreakHost.svelte";
import type { LanguageCode } from "$lib/constants";

let { children, data } = $props();
provideStreakPresentation();
let isHome = $derived(page.url.pathname === `${base}/`);
let hasMasthead = $derived(isHome || (dev && page.url.pathname === `${base}/streak-lab`));
let isHall = $derived(isQuestMenuPath(page.url.pathname));
let questMenuRoute = $derived(isHall ? page.data.questMenu : null);
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
	<!-- Scoped to the pages that mount the navbar; session practice UIs may never show the avatar. -->
	{#if !isSessionPage}
		<link rel="preload" as="image" href={data.avatarUrl}>
	{/if}
</svelte:head>

<div class="min-h-screen" class:app-shell={!isSessionPage}>
	{#if !isSessionPage}
		<Navbar user={data.user} avatarUrl={data.avatarUrl} lang={data.user.activeLanguage as LanguageCode} />
	{/if}

	<ActionNotification notification={quotaNotification} durationMs={7000} />
	<StreakHost
		record={data.streak}
		queueEmpty={data.streakQueueEmpty}
		userId={data.user.id}
		lang={data.user.activeLanguage as LanguageCode}
		dayOffset={data.streakDayOffset}
	/>

	{#if isSessionPage}
		<main class="h-screen w-full">{@render children()}</main>
	{:else}
		<!-- The paper belongs to the snapshot: a transparent page would let the outgoing page show
		     through wherever this one has no content while the two sweep past each other. -->
		<div class="min-h-screen bg-background" style="view-transition-name: page-content">
			<!-- The extra bottom padding clears the narrow-screen bottom bar. The hall measure is wider than
			     the reading measure because the book spread needs the room; owning both edges here is what
			     keeps the masthead, the hall heading and the spread on one set of margins. -->
			<main
				class="mx-auto px-4 pb-[calc(var(--app-bottom-nav-height)+2rem)] {isHall ? 'max-w-[42rem] nav:max-w-[76rem]' : 'max-w-5xl'} {hasMasthead
					? 'pt-0'
					: 'pt-8 nav:pt-24'}"
			>
				{#if hasMasthead}
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
