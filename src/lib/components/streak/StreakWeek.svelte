<script lang="ts">
import { dev } from "$app/environment";
import { base } from "$app/paths";
import { streakPreview } from "$lib/client/streak-preview.svelte";
import type { LanguageCode } from "$lib/constants";
import { t } from "$lib/i18n";
import type { StreakView } from "$lib/streak";
import { calendarDays, monthRange, type StreakDayMark } from "$lib/streak-history";
import { streakWeek } from "$lib/streak-presentation";

let { view, today, lang, compact = false }: { view: StreakView; today: string; lang: LanguageCode; compact?: boolean } = $props();
let marks = $state<StreakDayMark[]>([]);
const days = $derived(streakWeek(view, today, marks));
$effect(() => {
	void view;
	if (dev && streakPreview.today) {
		const { from, to } = monthRange(today.slice(0, 7));
		marks = calendarDays(streakPreview.days, streakPreview.record, today, from, to);
		return;
	}
	marks = [];
	const controller = new AbortController();
	fetch(`${base}/api/streak/calendar?month=${today.slice(0, 7)}`, { signal: controller.signal })
		.then(async (response) => {
			if (!response.ok) return;
			const result = await response.json();
			if (!controller.signal.aborted) marks = result.days;
		})
		.catch(() => {
			/* Unknown history stays unmarked; the reward is independent of this read. */
		});
	return () => controller.abort();
});
function weekday(day: string) {
	return new Intl.DateTimeFormat(lang, { weekday: "short", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`));
}
</script>
<div class="week" class:compact aria-label={t(lang, "streak.week")}>
	{#each days as day}
		<div class="day" class:today={day.today} class:continued={day.continued} class:covered={day.state === "covered"} class:future={day.future}>
			<span class="weekday">{weekday(day.day)}</span>
			<span
				class="stamp"
				aria-label={`${day.day}: ${day.state === "covered" ? t(lang, "streak.protectedDay") : day.state === "lit" ? t(lang, "streak.dayLit") : day.today ? t(lang, "hall.today") : '—'}`}
			>
				{#if day.continued}
					<svg viewBox="0 0 32 32" aria-hidden="true"><path d={day.state === "covered" ? "M9 16h14" : "m8 16 5 5 11-12"} /></svg>
				{:else}
					<span>{Number(day.day.slice(-2))}</span>
				{/if}
			</span>
			<span class="dot" aria-hidden="true"></span>
		</div>
	{/each}
</div>
<style>
.week {
	display: grid;
	grid-template-columns: repeat(7, minmax(0, 1fr));
	gap: 5px;
	width: 100%;
}
.day {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 9px;
	color: #999084;
}
.weekday {
	font-size: 11px;
	font-weight: 650;
}
.stamp {
	width: 38px;
	height: 38px;
	display: grid;
	place-items: center;
	border: 1.4px solid #dbd3c5;
	border-radius: 47% 53% 48% 51%;
	font-size: 13px;
}
.continued .stamp {
	color: #fff9e9;
	background: #c67a34;
	border: 1.5px solid #91582d;
	box-shadow: inset 0 0 0 3px #e8b266;
	transform: rotate(-5deg);
}
.continued:nth-child(even) .stamp {
	transform: rotate(4deg);
}
.covered .stamp {
	background: #a4aaa5;
	border-color: #7d8982;
	box-shadow: inset 0 0 0 3px #c9cdc3;
}
.stamp svg {
	width: 26px;
	height: 26px;
	fill: none;
	stroke: currentColor;
	stroke-width: 2.6;
	stroke-linecap: round;
	stroke-linejoin: round;
}
.today {
	color: #75422c;
}
.today .stamp {
	outline: 1.5px solid #ad673a;
	outline-offset: 3px;
}
.dot {
	width: 4px;
	height: 4px;
	border-radius: 50%;
}
.today .dot {
	background: #ad673a;
}
.future {
	opacity: 0.5;
}
.compact {
	max-width: 320px;
	margin: auto;
}
.compact .stamp {
	width: 31px;
	height: 31px;
}
@media (max-width: 370px) {
	.stamp {
		width: 32px;
		height: 32px;
	}
	.weekday {
		font-size: 10px;
	}
}
</style>
