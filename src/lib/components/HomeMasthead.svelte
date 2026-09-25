<script lang="ts">
import Check from "@lucide/svelte/icons/check";
import { enhance } from "$app/forms";
import { base } from "$app/paths";
import { page } from "$app/state";
import { setNavbarTransitionIntent } from "$lib/client/page-transition";
import { LANGUAGE_CODES, LANGUAGE_LABELS, type LanguageCode } from "$lib/constants";
import type { StreakRecord } from "$lib/streak";
import FloatingPanel from "./FloatingPanel.svelte";
import LanguageFlag from "./LanguageFlag.svelte";
import StreakIndicator from "./streak/StreakIndicator.svelte";

type TrialQuotaNavBalance = {
	trialTokensLeft: number;
	trialTokensTotal: number;
};

interface Props {
	user: { id?: string; activeLanguage: string };
	trialQuota?: TrialQuotaNavBalance | null;
	streak?: StreakRecord | null;
	streakDayOffset?: number;
}
let { user, trialQuota = null, streak = null, streakDayOffset = 0 }: Props = $props();
// --- Language switcher ---
let langOpen = $state(false);
function onProfileShortcutClick(event: MouseEvent) {
	if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
	setNavbarTransitionIntent(new URL(`${base}/profile#llm`, page.url), "forward");
}
function quotaPercentage(balance: TrialQuotaNavBalance) {
	return Math.max(0, Math.min(100, Math.round((balance.trialTokensLeft / balance.trialTokensTotal) * 100)));
}

let quotaPercent = $derived(trialQuota ? quotaPercentage(trialQuota) : 0);
let quotaTone = $derived(!trialQuota ? "normal" : trialQuota.trialTokensLeft <= 0 ? "depleted" : quotaPercent <= 10 ? "low" : "normal");
</script>
{#snippet languageSwitcher()}
	<FloatingPanel
		bind:open={langOpen}
		label={`Language: ${LANGUAGE_LABELS[user.activeLanguage as LanguageCode]}`}
		triggerClass="rounded-full"
		class="w-44"
	>
		{#snippet trigger()}
			<LanguageFlag language={user.activeLanguage} />
		{/snippet}
		<form
			method="POST"
			action="{base}/?/switchLanguage"
			use:enhance={() => {
   return async ({ update }) => { langOpen = false; await update(); };
  }}
		>
			{#each LANGUAGE_CODES as lang}
				<button type="submit" name="language" value={lang} class="floating-menu-item" aria-pressed={user.activeLanguage === lang}>
					<LanguageFlag language={lang} /><span class="flex-1">{LANGUAGE_LABELS[lang]}</span>
					<Check size={16} class={user.activeLanguage === lang ? "" : "invisible"} aria-hidden="true" />
				</button>
			{/each}
		</form>
	</FloatingPanel>
{/snippet}

<div class="home-masthead">
	<div class="masthead-left">
		<a href="{base}/" class="flex min-h-11 items-center text-foreground"><span class="wordmark">Libiamo</span></a>
		{#if trialQuota}
			<a
				href="{base}/profile#llm"
				onclick={onProfileShortcutClick}
				class="flex min-h-11 items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors {quotaTone === 'depleted'
							? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
							: quotaTone === 'low'
								? 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100'
								: 'border-border bg-background/70 text-muted-foreground hover:bg-secondary hover:text-foreground'}"
				title="Trial AI balance"
			>
				<span>Trial</span>
				<span class="tabular-nums">{quotaPercent}%</span>
			</a>
		{/if}
	</div>
	<div class="masthead-right">
		{#if user.id}
			<StreakIndicator record={streak} userId={user.id} lang={user.activeLanguage as LanguageCode} dayOffset={streakDayOffset} />
		{/if}
		{@render languageSwitcher()}
	</div>
</div>
<style>
.home-masthead {
	position: relative;
	z-index: 40;
	display: flex;
	min-height: 3.5rem;
	align-items: center;
	justify-content: space-between;
	gap: 0.5rem;
	margin-bottom: 2.5rem;
}
.masthead-left,
.masthead-right {
	display: flex;
	align-items: center;
	gap: 0.5rem;
}
@media (min-width: 56.25rem) {
	.home-masthead {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 21rem minmax(0, 1fr);
	}
	.masthead-right {
		grid-column: 3;
		justify-content: flex-end;
	}
}
@media (max-width: 22rem) {
	.masthead-left,
	.masthead-right {
		gap: 0.125rem;
	}
}
</style>
