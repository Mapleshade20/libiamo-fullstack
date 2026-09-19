<script lang="ts">
import { dev } from "$app/environment";
import { base } from "$app/paths";
import { readAcknowledgedStreak, writeAcknowledgedStreak } from "$lib/client/streak-acknowledged";
import { streakPreview } from "$lib/client/streak-preview.svelte";
import ActionNotification from "$lib/components/ActionNotification.svelte";
import { LANGUAGE_LABELS, type LanguageCode } from "$lib/constants";
import { getDisplayClock } from "$lib/display-clock";
import { t } from "$lib/i18n";
import { startOfNextLocalDay } from "$lib/local-day";
import { acknowledgedStreak, localDay, type StreakEvent, type StreakRecord, streakTransitions, viewStreak } from "$lib/streak";
import StreakDigits from "./StreakDigits.svelte";
import StreakFlame from "./StreakFlame.svelte";

interface Props {
	record: StreakRecord | null;
	userId: string;
	lang: LanguageCode;
	/** Dev-only virtual day travel, in days; the server honours the same offset. */
	dayOffset?: number;
}

let { record, userId, lang, dayOffset = 0 }: Props = $props();

const clock = getDisplayClock();

// The request clock renders the first frame; after hydration the client owns the tick, because
// `displayClock` is a snapshot and cannot cross local midnight on its own.
let clientNow = $state<number | null>(null);
let open = $state(false);
let igniting = $state(false);
let badgePopping = $state(false);
let digitsDirection = $state<"up" | "down">("up");
let brokenNotice = $state<{ days: number; token: number } | null>(null);
let cardsByLanguage = $state<Partial<Record<LanguageCode, number>> | null>(null);
let cardsLoading = $state(false);
let timers: ReturnType<typeof setTimeout>[] = [];

const timeZone = $derived(clock().timeZone);
const activeRecord = $derived((dev ? streakPreview.record : null) ?? record);
const today = $derived((dev ? streakPreview.today : null) ?? localDay((clientNow ?? clock().now) + dayOffset * 86_400_000, timeZone));
const view = $derived(viewStreak(activeRecord, today));
// Every duration in these components is `calc(base * var(--streak-speed))`, so the harness's speed
// control and its forced reduced-motion branch are the same dial: zero collapses each transition
// into an instant state swap, exactly as the media query does.
const speed = $derived(dev ? (streakPreview.forceReducedMotion ? 0 : streakPreview.speed) : 1);

const notification = $derived(
	brokenNotice ? { variant: "info" as const, message: t(lang, "streak.broken"), key: `streak-broken:${brokenNotice.token}` } : null,
);

function dayLabel(count: number) {
	return t(lang, count === 1 ? "streak.dayOne" : "streak.dayMany").replace("{count}", String(count));
}

function after(ms: number, run: () => void) {
	timers.push(setTimeout(run, ms * speed));
}

function play(event: StreakEvent) {
	if (event.kind === "lit") {
		digitsDirection = "up";
		igniting = true;
		after(700, () => {
			igniting = false;
		});
	}
	if (event.kind === "saved-day-spent") digitsDirection = "up";
	if (event.kind === "saved-day-earned") {
		badgePopping = true;
		after(260, () => {
			badgePopping = false;
		});
	}
	if (event.kind === "broken") {
		digitsDirection = "down";
		brokenNotice = { days: event.previousDays, token: Date.now() };
	}
}

// Diff against what this device last acknowledged, not against the previous render: finishing a
// session navigates with a full page load, so there is no previous render to diff.
$effect(() => {
	const current = acknowledgedStreak(view, today);
	const previous = readAcknowledgedStreak(userId);
	writeAcknowledgedStreak(userId, current);
	for (const event of streakTransitions(previous, view, today)) play(event);
});

$effect(() => {
	// Re-derive at local midnight. A machine that slept through it fires no timer, so the
	// visibility check is not redundant.
	let timer: ReturnType<typeof setTimeout>;
	const schedule = () => {
		const untilMidnight = startOfNextLocalDay(Date.now(), timeZone).getTime() - Date.now();
		timer = setTimeout(
			() => {
				clientNow = Date.now();
				schedule();
			},
			Math.max(1_000, untilMidnight + 1_000),
		);
	};
	schedule();
	const onVisible = () => {
		if (!document.hidden) clientNow = Date.now();
	};
	document.addEventListener("visibilitychange", onVisible);
	return () => {
		clearTimeout(timer);
		document.removeEventListener("visibilitychange", onVisible);
	};
});

$effect(() => {
	if (!dev) return;
	const replay = streakPreview.replay;
	if (replay) play(replay.event);
});

$effect(() => () => {
	for (const timer of timers) clearTimeout(timer);
	timers = [];
});

async function loadCardCounts() {
	if (cardsByLanguage || cardsLoading) return;
	cardsLoading = true;
	try {
		const response = await fetch(`${base}/api/review/stats?byLanguage=1`);
		if (response.ok) cardsByLanguage = ((await response.json()) as { byLanguage?: Partial<Record<LanguageCode, number>> }).byLanguage ?? {};
	} catch {
		// The lit state never depends on this fetch; the panel just keeps its skeleton.
	} finally {
		cardsLoading = false;
	}
}

function toggle() {
	open = !open;
	if (open) void loadCardCounts();
}

const remainingLanguages = $derived(
	cardsByLanguage ? (Object.entries(cardsByLanguage) as Array<[LanguageCode, number]>).filter(([, count]) => count > 0) : [],
);
</script>

<div class="relative" style="--streak-speed: {speed}">
	<button
		type="button"
		class="flex h-11 items-center gap-1.5 rounded-full px-2 transition-colors hover:bg-secondary"
		aria-expanded={open}
		aria-label={t(lang, "streak.label")}
		onclick={toggle}
	>
		<StreakFlame status={view.status} {igniting} />
		<span class="relative pr-2 text-sm font-medium">
			<StreakDigits value={view.days} direction={digitsDirection} muted={view.status !== "lit"} />
			{#if view.bank > 0}
				<span class="badge" class:popping={badgePopping}>+{view.bank}</span>
			{/if}
		</span>
	</button>

	{#if open}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="absolute top-full right-0 z-50 mt-2 w-72 rounded-lg border border-border bg-popover p-4 text-left shadow-sm"
			role="dialog"
			aria-label={t(lang, "streak.label")}
		>
			<p class="font-serif text-lg">{dayLabel(view.days)}</p>
			<p class="mt-1 text-xs text-muted-foreground">
				{view.days === 0 ? t(lang, "streak.none") : view.status === "lit" ? t(lang, "streak.lit") : t(lang, "streak.pending")}
			</p>

			<ul class="mt-3 space-y-1.5 text-sm">
				<li class="flex items-baseline justify-between gap-3">
					<span class={view.taskCount > 0 ? "text-foreground" : "text-muted-foreground"}>{t(lang, "streak.conditionQuest")}</span>
					<span class="text-xs text-muted-foreground tabular-nums"> {t(lang, "streak.questsDone").replace("{count}", String(view.taskCount))} </span>
				</li>
				<li class="flex items-baseline justify-between gap-3">
					<span class={view.reviewCleared ? "text-foreground" : "text-muted-foreground"}>{t(lang, "streak.conditionReview")}</span>
					<span class="text-xs text-muted-foreground tabular-nums">
						{#if view.reviewCleared}
							{t(lang, "streak.reviewCleared")}
						{:else if cardsByLanguage}
							{#if remainingLanguages.length === 0}
								{t(lang, "streak.reviewRemaining").replace("{count}", "0")}
							{:else}
								{remainingLanguages
									.map(([code, count]) => `${LANGUAGE_LABELS[code]} ${t(lang, "streak.reviewRemaining").replace("{count}", String(count))}`)
									.join(" · ")}
							{/if}
						{:else}
							<span class="inline-block h-3 w-16 animate-pulse rounded bg-muted align-middle"></span>
						{/if}
					</span>
				</li>
			</ul>

			<div class="mt-3 border-t border-border pt-3">
				<p class="flex items-baseline justify-between gap-3 text-sm">
					<span>{t(lang, "streak.savedDays")}</span>
					<span class="tabular-nums">{view.bank}</span>
				</p>
				<p class="mt-1 text-xs text-muted-foreground">
					{#if view.savedDaysSpent > 0}
						{t(lang, "streak.savedDaysSpent")}
					{:else if view.questsToNextSavedDay === null}
						{t(lang, "streak.savedDaysFull")}
					{:else}
						{t(lang, "streak.savedDaysNext").replace("{count}", String(view.questsToNextSavedDay))}
					{/if}
				</p>
				<p class="mt-1 text-xs text-muted-foreground">{t(lang, "streak.savedDaysHint")}</p>
			</div>
		</div>
	{/if}
</div>

<ActionNotification {notification} />

<style>
.badge {
	position: absolute;
	top: -0.45rem;
	right: -0.1rem;
	border-radius: 9999px;
	background: color-mix(in oklch, var(--color-streak-flame) 18%, transparent);
	color: var(--color-streak-flame);
	padding: 0 0.25rem;
	font-size: 0.625rem;
	font-weight: 600;
	line-height: 1.1;
}

.badge.popping {
	animation: badge-pop calc(240ms * var(--streak-speed, 1)) cubic-bezier(0.2, 0, 0.15, 1);
}

@keyframes badge-pop {
	0% {
		transform: scale(0.6);
	}
	60% {
		transform: scale(1.12);
	}
	100% {
		transform: scale(1);
	}
}

@media (prefers-reduced-motion: reduce) {
	.badge.popping {
		animation: none;
	}
}
</style>
