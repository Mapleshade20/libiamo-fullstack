<script lang="ts">
import { dev } from "$app/environment";
import { readAcknowledgedStreak, writeAcknowledgedStreak } from "$lib/client/streak-acknowledged";
import { createStreakDay } from "$lib/client/streak-day.svelte";
import { streakPreview } from "$lib/client/streak-preview.svelte";
import ActionNotification from "$lib/components/ActionNotification.svelte";
import type { LanguageCode } from "$lib/constants";
import { t } from "$lib/i18n";
import { acknowledgedStreak, type StreakRecord, streakTransitions, viewStreak } from "$lib/streak";
import { flameAppearance } from "$lib/streak-presentation";
import StreakBoard from "./StreakBoard.svelte";
import StreakDigits from "./StreakDigits.svelte";
import StreakFlame from "./StreakFlame.svelte";

let { record, userId, lang, dayOffset = 0 }: { record: StreakRecord | null; userId: string; lang: LanguageCode; dayOffset?: number } = $props();
const currentDay = createStreakDay(() => ({ record, offset: dayOffset }));
let boardOpen = $state(false);
let brokenNotice = $state(false);
const activeRecord = $derived((dev ? streakPreview.record : null) ?? record);
const today = $derived((dev ? streakPreview.today : null) ?? currentDay());
const view = $derived(viewStreak(activeRecord, today));
const speed = $derived(dev ? (streakPreview.forceReducedMotion ? 0 : streakPreview.speed) : 1);
$effect(() => {
	if (dev && streakPreview.today) return;
	const current = acknowledgedStreak(view, today);
	const previous = readAcknowledgedStreak(userId);
	writeAcknowledgedStreak(userId, current);
	brokenNotice = streakTransitions(previous, view, today).some((event) => event.kind === "broken");
});
</script>
<button
	type="button"
	class="streak-trigger"
	class:lit={view.status === "lit"}
	onclick={() => { boardOpen = true; }}
	aria-label={`${t(lang, "streak.label")}: ${view.days}`}
	aria-haspopup="dialog"
	aria-expanded={boardOpen}
	style="--streak-speed: {speed}"
>
	<StreakFlame appearance={flameAppearance(view)} />
	<span class="number">
		<StreakDigits value={view.days} muted={view.status !== "lit"} />
		{#if view.bank > 0}
			{#key view.bank}
				<span class="badge">+{view.bank}</span>
			{/key}
		{/if}
	</span>
</button>
<StreakBoard bind:open={boardOpen} {view} {today} {lang} />
<ActionNotification notification={brokenNotice ? { variant: "info", message: t(lang, "streak.broken"), key: `streak-broken:${today}` } : null} />
<style>
.streak-trigger {
	display: inline-flex;
	align-items: center;
	gap: 5px;
	min-height: 48px;
	padding: 2px 12px 2px 5px;
	border-radius: 14px;
	transition: background 180ms;
}
.streak-trigger:hover {
	background: #c9923820;
}
.streak-trigger:focus-visible {
	outline: 2px solid #9b6635;
	outline-offset: 3px;
}
.number {
	position: relative;
	padding-right: 0.45rem;
	font-family: var(--font-sans);
	font-size: 1.3rem;
	font-weight: 700;
	line-height: 1;
	color: var(--color-muted-foreground);
	transition: color calc(300ms * var(--streak-speed, 1)) ease-out;
	font-variant-numeric: tabular-nums;
	min-width: 1.2ch;
}
.lit .number {
	color: #f2700f;
}
.badge {
	position: absolute;
	top: -0.5rem;
	right: -0.25rem;
	border-radius: 9999px;
	background: color-mix(in oklch, #ff9a04 24%, transparent);
	color: color-mix(in oklch, #f2700f 90%, #000);
	padding: 0 0.25rem;
	font-family: var(--font-sans-inter);
	font-size: 0.625rem;
	font-weight: 600;
	line-height: 1.25;
	letter-spacing: 0;
	animation: earn calc(350ms * var(--streak-speed, 1)) ease-out;
}
@keyframes earn {
	from {
		transform: scale(0.4) rotate(-15deg);
	}
	to {
		transform: scale(1);
	}
}
@media (prefers-reduced-motion: reduce) {
	.badge {
		animation: none;
	}
}
</style>
