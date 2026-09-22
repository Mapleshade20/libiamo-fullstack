<script lang="ts">
/**
 * The month of days on the board's sheet, drawn as a run rather than as a scatter of ticks.
 *
 * Consecutive counted days share one ink pill, which is the whole reason the calendar is worth
 * showing: a streak is a *run*, and seven separate circles do not read as one. The pill is closed
 * at the run's ends and square where the run continues into the next cell, so a week that is
 * entirely counted draws as one uninterrupted band.
 */
import ChevronLeft from "@lucide/svelte/icons/chevron-left";
import ChevronRight from "@lucide/svelte/icons/chevron-right";
import type { LanguageCode } from "$lib/constants";
import { t } from "$lib/i18n";
import { addDays } from "$lib/local-day";
import type { StreakDayMark } from "$lib/streak-history";
import { monthOffset } from "$lib/streak-history";

interface Props {
	/** The month on show, as `YYYY-MM`. */
	month: string;
	today: string;
	marks: Map<string, StreakDayMark["state"]>;
	/** Continuous recording boundary; earlier missing days are unknown, not empty. */
	since: string | null;
	loading?: boolean;
	lang: LanguageCode;
	onMonth: (month: string) => void;
}

let { month, today, marks, since, loading = false, lang, onMonth }: Props = $props();

const WEEK_STARTS_MONDAY = 1;

const firstOfMonth = $derived(`${month}-01`);
const monthLabel = $derived(
	new Intl.DateTimeFormat(lang, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${firstOfMonth}T00:00:00Z`)),
);

const weekdayLabels = $derived.by(() => {
	const formatter = new Intl.DateTimeFormat(lang, { weekday: "short", timeZone: "UTC" });
	// 2024-01-01 was a Monday, so this walks the week from whatever day the grid starts on. Two
	// letters, because English `narrow` renders Tuesday and Thursday both as "T".
	return Array.from({ length: 7 }, (_, index) => formatter.format(new Date(Date.UTC(2024, 0, 1 + index))).slice(0, 2));
});

/** Six weeks of cells, so paging months never changes the sheet's height. */
const cells = $derived.by(() => {
	const first = new Date(`${firstOfMonth}T00:00:00Z`);
	const offset = (first.getUTCDay() - WEEK_STARTS_MONDAY + 7) % 7;
	const start = addDays(firstOfMonth, -offset);
	return Array.from({ length: 42 }, (_, index) => {
		const day = addDays(start, index);
		const state = marks.get(day) ?? null;
		return {
			day,
			date: Number(day.slice(8)),
			inMonth: day.slice(0, 7) === month,
			isToday: day === today,
			future: day > today,
			// Before the first recorded day there is no answer, only an absence of records.
			unknown: !state && (since === null || day < since),
			state,
			// A run is unbroken across the month's edges, so continuation looks at the real
			// neighbouring day rather than at whether the next cell is in this month.
			runsLeft: marks.has(addDays(day, -1)),
			runsRight: marks.has(addDays(day, 1)),
		};
	});
});

const previousMonth = $derived(monthOffset(month, -1));
const nextMonth = $derived(monthOffset(month, 1));
const atPresent = $derived(nextMonth > today.slice(0, 7));
</script>

<div class="calendar">
	<div class="month-bar">
		<button
			type="button"
			class="pager"
			onclick={() => onMonth(previousMonth)}
			disabled={month <= "1900-01"}
			aria-label={t(lang, "streak.previousMonth")}
		>
			<ChevronLeft size={16} aria-hidden="true" />
		</button>
		<span class="month-name">{monthLabel}</span>
		<button type="button" class="pager" onclick={() => onMonth(nextMonth)} disabled={atPresent} aria-label={t(lang, "streak.nextMonth")}>
			<ChevronRight size={16} aria-hidden="true" />
		</button>
	</div>

	<div class="weekdays" aria-hidden="true">
		{#each weekdayLabels as label, index (index)}
			<span>{label}</span>
		{/each}
	</div>

	<div class="grid" class:loading role="list" aria-label={monthLabel} aria-busy={loading}>
		{#each cells as cell (cell.day)}
			<div
				class="cell"
				class:outside={!cell.inMonth}
				class:today={cell.isToday}
				class:unknown={cell.unknown && !cell.future}
				class:future={cell.future}
				data-state={cell.state ?? "none"}
				role="listitem"
				aria-current={cell.isToday ? "date" : undefined}
				aria-label={`${cell.day}: ${t(lang, cell.state === "lit" ? "streak.dayLit" : cell.state === "covered" ? "streak.protectedDay" : cell.future ? "streak.futureDay" : cell.unknown ? "streak.unknownDay" : "streak.unlitDay")}`}
			>
				{#if cell.state}
					<span class="run" class:open-left={cell.runsLeft} class:open-right={cell.runsRight} aria-hidden="true"></span>
				{/if}
				<span class="date">{cell.date}</span>
				{#if cell.state === "lit"}
					<svg class="tick" viewBox="0 0 12 12" aria-hidden="true"><path class="nav-stroke" d="M2.2 6.4 4.6 8.9 9.8 3.1" /></svg>
				{:else if cell.state === "covered"}
					<!-- A day ruled through: accounted for by a saved day, not worked. -->
					<svg class="tick" viewBox="0 0 12 12" aria-hidden="true"><path class="nav-stroke" d="M2.4 6.1q3.6-.5 7.2 0" /></svg>
				{/if}
			</div>
		{/each}
	</div>
</div>

<style>
.calendar {
	--cell: 2.05rem;
}

.month-bar {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 0.5rem;
}

.month-name {
	font-family: var(--font-serif, serif);
	font-size: 1rem;
	letter-spacing: 0.01em;
}

.pager {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	/* The sheet is reachable by touch, so the pagers carry a full target while drawing small. */
	min-width: 2.75rem;
	min-height: 2.75rem;
	margin: -0.6rem 0;
	color: #8b7661;
	border-radius: 9999px;
	transition: color 160ms ease-out;
}

.pager:hover:not(:disabled) {
	color: var(--color-foreground);
}

.pager:disabled {
	opacity: 0.3;
}

.weekdays,
.grid {
	display: grid;
	grid-template-columns: repeat(7, minmax(0, 1fr));
}

.weekdays {
	margin-top: 0.6rem;
	font-size: 0.6875rem;
	color: #8b7661;
	text-align: center;
}

.grid {
	margin-top: 0.2rem;
	transition: opacity 200ms ease-out;
}

.grid.loading {
	opacity: 0.35;
}

.cell {
	position: relative;
	display: flex;
	align-items: center;
	justify-content: center;
	height: var(--cell);
	font-size: 0.8125rem;
	font-variant-numeric: tabular-nums;
	color: var(--color-foreground);
}

.cell.outside {
	visibility: hidden;
}

.date {
	position: relative;
	z-index: 1;
	/* The tick sits over the run, so the number steps up to make room for it. */
	transform: translateY(-0.3em);
	font-size: 0.75rem;
}

/* Not "nothing happened" — "nothing was being recorded". The two must not look alike. */
.cell.unknown .date {
	opacity: 0.28;
}

/* A day that has not happened yet is not a day the learner missed. */
.cell.future .date {
	opacity: 0.4;
}

.cell[data-state="lit"] .date,
.cell[data-state="covered"] .date {
	color: color-mix(in oklch, #b76b27 88%, #000);
}

/*
 * The run: one band across consecutive days. It bleeds a hair past the cell on the sides that
 * continue, because a grid gap of exactly zero still leaves a seam at fractional cell widths.
 */
.run {
	position: absolute;
	inset: 0.15rem 0.08rem;
	border-radius: 9999px;
	/*
	 * Mixed off the *orange*, not the gold: the flame's body colour is a near-yellow, and a quarter
	 * of it over warm paper is a lemon wash that reads as highlighter rather than as fire.
	 */
	background: color-mix(in oklch, #ff9a04 32%, transparent);
}

/* A day the bank paid for: the same run, spent rather than worked, so it is drawn cooler. */
.cell[data-state="covered"] .run {
	background: color-mix(in oklch, #8b7661 22%, transparent);
}

.run.open-left {
	left: -0.5px;
	border-top-left-radius: 0;
	border-bottom-left-radius: 0;
}

.run.open-right {
	right: -0.5px;
	border-top-right-radius: 0;
	border-bottom-right-radius: 0;
}

.cell.today .run {
	box-shadow: inset 0 0 0 1.5px color-mix(in oklch, #b76b27 55%, transparent);
}

/* Today with nothing on it still has to be findable; a ring, not a fill, so it is not a claim. */
.cell.today:not([data-state="lit"]):not([data-state="covered"])::after {
	content: "";
	position: absolute;
	inset: 0.15rem 0.08rem;
	border-radius: 9999px;
	border: 1.5px dashed color-mix(in oklch, #8b7661 55%, transparent);
}

.tick {
	position: absolute;
	z-index: 1;
	bottom: 0.18rem;
	width: 0.72rem;
	height: 0.72rem;
}

.tick .nav-stroke {
	stroke: color-mix(in oklch, #b76b27 88%, #000);
	stroke-width: 1.7;
}

.cell[data-state="covered"] .tick .nav-stroke {
	stroke: color-mix(in oklch, #8b7661 80%, #000);
}

@media (prefers-reduced-motion: reduce) {
	.grid,
	.pager {
		transition: none;
	}
}
</style>
