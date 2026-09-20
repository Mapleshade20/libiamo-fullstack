<script lang="ts">
import { MediaQuery } from "svelte/reactivity";
import { scale } from "svelte/transition";
import { enhance } from "$app/forms";
import { base } from "$app/paths";
import { page } from "$app/state";
import { setNavbarTransitionIntent } from "$lib/client/page-transition";
import { LANGUAGE_CODES, LANGUAGE_LABELS, type LanguageCode } from "$lib/constants";
import type { StreakRecord } from "$lib/streak";
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
const reducedMotion = new MediaQuery("(prefers-reduced-motion: reduce)", true);
let langTrigger: HTMLButtonElement | undefined = $state();

function clickOutside(node: HTMLElement, params: { onClose: () => void; exclude: (HTMLElement | undefined)[] }) {
	let handler: ((e: MouseEvent) => void) | null = null;
	// Defer so the click that opened this dropdown doesn't immediately close it
	const timer = setTimeout(() => {
		handler = (event: MouseEvent) => {
			const target = event.target as Node;
			if (node.contains(target)) return;
			for (const el of params.exclude) {
				if (el?.contains(target)) return;
			}
			params.onClose();
		};
		document.addEventListener("click", handler);
	}, 0);
	return {
		destroy() {
			clearTimeout(timer);
			if (handler) document.removeEventListener("click", handler);
		},
	};
}

function onProfileShortcutClick(event: MouseEvent) {
	if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
	setNavbarTransitionIntent(new URL(`${base}/profile`, page.url), "forward");
}
function quotaPercentage(balance: TrialQuotaNavBalance) {
	return Math.max(0, Math.min(100, Math.round((balance.trialTokensLeft / balance.trialTokensTotal) * 100)));
}

let quotaPercent = $derived(trialQuota ? quotaPercentage(trialQuota) : 0);
let quotaTone = $derived(!trialQuota ? "normal" : trialQuota.trialTokensLeft <= 0 ? "depleted" : quotaPercent <= 10 ? "low" : "normal");
</script>
<svelte:window
	onkeydown={(event) => {
		if (event.key === "Escape" && langOpen) {
			langOpen = false;
			langTrigger?.focus({ preventScroll: true });
		}
	}}
/>

{#snippet languageSwitcher()}
	<div class="relative">
		<button
			type="button"
			bind:this={langTrigger}
			onclick={() => (langOpen = !langOpen)}
			class="flex size-11 items-center justify-center rounded-full transition-colors hover:bg-secondary"
			aria-label={`Language: ${LANGUAGE_LABELS[user.activeLanguage as LanguageCode]}`}
			aria-expanded={langOpen}
		>
			<LanguageFlag language={user.activeLanguage} />
		</button>

		{#if langOpen}
			<div
				transition:scale={{ start: 0.97, duration: reducedMotion.current ? 0 : 250 }}
				style="transform-origin: top right"
				class="absolute right-0 mt-3 w-40 overflow-hidden rounded-xl border border-border bg-stone-50/95 backdrop-blur-xl shadow-lg z-50"
				use:clickOutside={{ onClose: () => { langOpen = false; }, exclude: [langTrigger] }}
			>
				<form
					method="POST"
					action="{base}/?/switchLanguage"
					use:enhance={() => {
						return async ({ update }) => {
							langOpen = false;
							await update();
						};
					}}
				>
					<div class="py-1">
						{#each LANGUAGE_CODES as lang}
							<button
								type="submit"
								name="language"
								value={lang}
								class="flex min-h-11 w-full items-center gap-3 px-3 py-2 text-sm hover:bg-secondary transition-colors {user.activeLanguage === lang
									? 'bg-primary/10 text-primary font-semibold'
									: 'text-foreground'}"
							>
								<LanguageFlag language={lang} />
								<span>{LANGUAGE_LABELS[lang]}</span>
							</button>
						{/each}
					</div>
				</form>
			</div>
		{/if}
	</div>
{/snippet}

<div class="home-masthead">
	<div class="masthead-left">
		<a href="{base}/" class="flex min-h-11 items-center text-foreground"><span class="wordmark">Libiamo</span></a>
		{#if trialQuota}
			<a
				href="{base}/profile"
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
