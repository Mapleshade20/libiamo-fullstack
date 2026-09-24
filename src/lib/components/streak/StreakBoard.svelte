<script lang="ts">
import { untrack } from "svelte";
import { dev } from "$app/environment";
import { base } from "$app/paths";
import ModalDialog from "$lib/components/common/ModalDialog.svelte";
import { streakPreview } from "$lib/components/streak/preview.svelte";
import { LANGUAGE_LABELS, type LanguageCode } from "$lib/constants";
import { t } from "$lib/i18n";
import { calendarDays, monthRange, type StreakCalendarData } from "$lib/streak/history";
import { flameAppearance } from "$lib/streak/presentation";
import type { StreakView } from "$lib/streak/rules";
import StreakCalendar from "./StreakCalendar.svelte";
import StreakDigits from "./StreakDigits.svelte";
import StreakFlame from "./StreakFlame.svelte";

let { open: isOpen = $bindable(false), view, today, lang }: { open?: boolean; view: StreakView; today: string; lang: LanguageCode } = $props();
const id = $props.id();
let counts = $state<Partial<Record<LanguageCode, number>> | null>(null);
let failed = $state(false);
$effect(() => {
	if (!isOpen || view.reviewCleared) return;
	if (dev && streakPreview.today) {
		counts = {};
		return;
	}
	const controller = new AbortController();
	counts = null;
	failed = false;
	fetch(`${base}/api/review/stats?byLanguage=1`, { signal: controller.signal })
		.then(async (response) => {
			if (!response.ok) throw new Error("Review counts unavailable");
			const result = await response.json();
			if (!controller.signal.aborted) counts = result.byLanguage ?? {};
		})
		.catch(() => {
			if (!controller.signal.aborted) failed = true;
		});
	return () => controller.abort();
});
const remaining = $derived(counts ? (Object.entries(counts) as [LanguageCode, number][]).filter(([, count]) => count > 0) : []);

let month = $state(untrack(() => today.slice(0, 7)));
let days = $state<StreakCalendarData["days"]>([]);
// Kept across month fetches: it bounds paging, so it must not blink away while the next month loads.
let since = $state<string | null>(null);
let loading = $state(false);
let calendarFailed = $state(false);
let retry = $state(0);
const marks = $derived(new Map(days.map(({ day, state }) => [day, state])));
$effect(() => {
	if (isOpen) month = untrack(() => today.slice(0, 7));
});
$effect(() => {
	if (!isOpen) return;
	const selectedMonth = month;
	// Refetch if a completion or local midnight changes the open sheet.
	void today;
	void view;
	void retry;
	calendarFailed = false;
	days = [];
	if (dev && streakPreview.today) {
		const { from, to } = monthRange(selectedMonth);
		days = calendarDays(streakPreview.days, streakPreview.record, today, from, to);
		since = streakPreview.since;
		loading = false;
		return;
	}
	const controller = new AbortController();
	loading = true;
	fetch(`${base}/api/streak/calendar?month=${selectedMonth}`, { signal: controller.signal })
		.then(async (response) => {
			if (!response.ok) throw new Error("Calendar unavailable");
			const result: StreakCalendarData = await response.json();
			if (controller.signal.aborted) return;
			days = result.days;
			since = result.since;
		})
		.catch(() => {
			if (!controller.signal.aborted) calendarFailed = true;
		})
		.finally(() => {
			if (!controller.signal.aborted) loading = false;
		});
	return () => controller.abort();
});
</script>

<ModalDialog
	bind:open={isOpen}
	labelledby="{id}-title"
	variant="sheet"
	lightDismiss
	motionScale={dev ? (streakPreview.forceReducedMotion ? 0 : streakPreview.speed) : 1}
>
	<div class="clipboard">
		<svg class="wood" viewBox="0 0 540 650" preserveAspectRatio="none" aria-hidden="true">
			<path d="M20 8Q260 2 517 9Q532 9 533 27L538 650H4L7 27Q7 11 20 8Z" fill="#b58b61" stroke="#594735" stroke-width="2" />
			<path
				d="M18 43Q12 160 19 271T16 542M27 125Q21 186 28 214M518 32Q527 171 519 277T526 603M507 434Q516 507 511 569M35 612Q230 602 493 617M27 628Q180 620 478 633"
				fill="none"
				stroke="#775638"
				stroke-width="1.4"
				opacity=".55"
			/>
		</svg>
		<div class="clip" aria-hidden="true"><span></span></div>
		<button type="button" class="close" onclick={() => { isOpen = false; }} aria-label={t(lang, "common.close")}>×</button>
		<div class="paper">
			<div class="headline">
				<StreakFlame appearance={flameAppearance(view)} size={96} idle={isOpen} />
				<div class="count">
					<span class="digits-large" class:unlit={view.status !== "lit"}> <StreakDigits value={view.days} muted={false} /> </span>
					<span id="{id}-title" class="count-label">{t(lang, "streak.dayStreakLabel")}</span>
				</div>
			</div>

			<p class="note">{view.days === 0 ? t(lang, "streak.none") : view.status === "lit" ? t(lang, "streak.lit") : t(lang, "streak.pending")}</p>

			<h3 class="rule-heading">{t(lang, "streak.todayHeading")}</h3>
			<ul class="todo">
				<li class="task" class:done={view.taskCount > 0}>
					<span class="checkbox" aria-hidden="true">
						<svg viewBox="0 0 16 16" aria-hidden="true">
							<rect class="box nav-stroke" x="1.6" y="1.9" width="12.6" height="12.2" rx="2.2" />
							<path class="mark nav-stroke" d="M4.3 8.3 6.9 11 11.9 4.9" />
						</svg>
					</span>
					<span class="todo-text">{t(lang, "streak.conditionQuest")}</span>
					<span class="todo-detail">{t(lang, "streak.questsDone").replace("{count}", String(view.taskCount))}</span>
				</li>
				<li class="task" class:done={view.reviewCleared}>
					<span class="checkbox" aria-hidden="true">
						<svg viewBox="0 0 16 16" aria-hidden="true">
							<rect class="box nav-stroke" x="1.6" y="1.9" width="12.6" height="12.2" rx="2.2" />
							<path class="mark nav-stroke" d="M4.3 8.3 6.9 11 11.9 4.9" />
						</svg>
					</span>
					<span class="todo-text">{t(lang, "streak.conditionReview")}</span>
					<span class="todo-detail">
						{#if view.reviewCleared}
							{t(lang, "streak.reviewCleared")}
						{:else if counts}
							{#if remaining.length === 0}
								{t(lang, "streak.reviewRemaining").replace("{count}", "0")}
							{:else}
								{remaining
												.map(([code, count]) => `${LANGUAGE_LABELS[code]} ${t(lang, "streak.reviewRemaining").replace("{count}", String(count))}`)
												.join(" · ")}
							{/if}
						{:else if failed}
							{t(lang, "streak.countsUnavailable")}
						{:else}
							<span class="detail-skeleton"></span>
						{/if}
					</span>
				</li>
			</ul>

			<div class="divider" aria-hidden="true"></div>

			<StreakCalendar {month} {today} {marks} {since} {loading} {lang} onMonth={(next) => { month = next; }} />
			{#if calendarFailed}
				<button class="retry" type="button" onclick={() => { retry++; }}>{t(lang, "streak.calendarRetry")}</button>
			{/if}

			{#if view.bank > 0 || view.questsToNextSavedDay !== null}
				<p class="saved">
					<span class="saved-label">{t(lang, "streak.savedDays")}</span>
					<span class="saved-pips" aria-hidden="true">
						{#each { length: 3 } as _, index (index)}
							<span class="pip" class:filled={index < view.bank}></span>
						{/each}
					</span>
					<span class="saved-hint">
						{#if view.savedDaysSpent > 0}
							{t(lang, "streak.savedDaysSpent")}
						{:else if view.questsToNextSavedDay === null}
							{t(lang, "streak.savedDaysFull")}
						{:else}
							{t(lang, "streak.savedDaysNext").replace("{count}", String(view.questsToNextSavedDay))}
						{/if}
					</span>
				</p>
			{/if}
		</div>
	</div></ModalDialog
>
<style>
.clipboard {
	position: relative;
	padding: 49px 25px 25px;
	color: #423a31;
	isolation: isolate;
}
.wood {
	position: absolute;
	inset: 0;
	width: 100%;
	height: 100%;
	z-index: -1;
}
.clip {
	position: absolute;
	z-index: 2;
	top: 19px;
	left: 50%;
	transform: translateX(-50%) rotate(-1deg);
	width: 124px;
	height: 43px;
	border: 1.5px solid #4a4940;
	border-radius: 9px 8px 4px 5px;
	background: linear-gradient(#b9b9a7 0 25%, #e4dfcb 26% 43%, #8c8e80 45% 52%, #c4c4b1 54%);
	box-shadow: 2px 3px 0 #44382c33;
}
.clip span {
	position: absolute;
	top: -10px;
	left: 43px;
	width: 34px;
	height: 20px;
	border: 1.5px solid #55574e;
	border-radius: 50% 50% 0 0;
	background: #b5b5a4;
}
.close {
	position: absolute;
	z-index: 3;
	right: 12px;
	top: 10px;
	width: 44px;
	height: 44px;
	font-size: 27px;
	line-height: 1;
	color: #44382d;
	border-radius: 50%;
	transition:
		background-color 180ms ease-out,
		color 180ms ease-out;
}
@media (hover: hover) and (pointer: fine) {
	.close:hover {
		background: #4738291f;
		color: #23180f;
	}
}
.close:active {
	background: #47382930;
}
.close:focus-visible {
	outline: 2px solid #522b21;
	outline-offset: -5px;
}
.paper {
	position: relative;
	padding: 30px 27px 23px;
	background: #fcf8ec;
	box-shadow: 3px 5px 0 #59433040;
	border: 1px solid #e4d8bb;
	border-radius: 2px 4px 9px 2px;
}
.paper::after {
	content: "";
	position: absolute;
	right: 15px;
	top: -10px;
	width: 65px;
	height: 23px;
	transform: rotate(7deg);
	background: #dbbd6a65;
	border-inline: 1px dashed #c6a95c50;
}
.headline {
	display: flex;
	align-items: center;
	gap: 0.85rem;
}

.count {
	display: flex;
	flex-direction: column;
	line-height: 1.05;
}

.digits-large {
	font-family: var(--font-sans);
	font-size: 2.6rem;
	font-weight: 700;
	color: #b76b27;
	transition: color 300ms ease-out;
}

.digits-large.unlit {
	color: #8b7661;
}

.count-label {
	margin-top: 0.15rem;
	font-size: 0.8125rem;
	font-weight: 500;
	letter-spacing: 0.02em;
	color: #8b7661;
}

.note {
	margin-top: 0.7rem;
	font-size: 0.8125rem;
	line-height: 1.5;
	color: #8b7661;
}

.rule-heading {
	margin-top: 1.15rem;
	font-size: 0.6875rem;
	font-weight: 600;
	letter-spacing: 0.09em;
	text-transform: uppercase;
	color: #8b7661;
}

.todo {
	margin-top: 0.5rem;
	background: repeating-linear-gradient(transparent 0 32px, #c9d3ca35 32px 33px);
}

.todo li {
	display: flex;
	align-items: center;
	gap: 0.6rem;
	padding: 0.45rem 0;
	/* A ruled line per item, the way a list on paper is ruled. */
	border-bottom: 1px solid color-mix(in oklch, var(--color-border) 70%, transparent);
	font-size: 0.875rem;
	color: #8b7661;
}

.todo li:last-child {
	border-bottom: none;
}

.todo-text {
	flex: 1;
}

.todo li.done .todo-text {
	color: var(--color-foreground);
}

.todo-detail {
	font-size: 0.75rem;
	font-variant-numeric: tabular-nums;
	color: #8b7661;
}

.checkbox {
	width: 1.15rem;
	height: 1.15rem;
	line-height: 0;
}

.checkbox svg {
	width: 100%;
	height: 100%;
	--nav-ink-scale: 0.5;
}

.box {
	fill: #fff;
	stroke: color-mix(in oklch, #8b7661 70%, transparent);
}

.mark {
	fill: none;
	stroke: #b76b27;
	opacity: 0;
	transition: opacity 220ms ease-out;
}

.todo li.done .mark {
	opacity: 1;
}

.todo li.done .box {
	stroke: color-mix(in oklch, #b76b27 45%, transparent);
}

.detail-skeleton {
	display: inline-block;
	width: 4rem;
	height: 0.7rem;
	border-radius: 9999px;
	background: var(--color-muted);
	vertical-align: middle;
}

.divider {
	margin: 1.1rem 0 0.9rem;
	border-top: 1px solid color-mix(in oklch, var(--color-border) 70%, transparent);
}

/* ── Saved days ───────────────────────────────────────────────────────── */

.saved {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 0.45rem;
	margin-top: 1rem;
	font-size: 0.75rem;
	color: #8b7661;
}

.saved-label {
	font-weight: 500;
	color: var(--color-foreground);
}

.saved-pips {
	display: inline-flex;
	gap: 0.2rem;
}

.pip {
	width: 0.5rem;
	height: 0.5rem;
	border-radius: 9999px;
	border: 1.25px solid color-mix(in oklch, var(--color-accent-yellow) 70%, transparent);
}

.pip.filled {
	background: var(--color-accent-yellow);
}

.saved-hint {
	flex-basis: 100%;
	line-height: 1.45;
}

@media (prefers-reduced-motion: reduce) {
	.mark,
	.digits-large,
	.close {
		transition: none;
	}
}

.retry {
	min-height: 44px;
	font-size: 12px;
	color: #8b603a;
}
@media (max-width: 420px) {
	.clipboard {
		padding: 48px 15px 20px;
	}
	.paper {
		padding: 25px 18px 20px;
	}
	.todo-detail {
		max-width: 42%;
		text-align: right;
	}
}
</style>
