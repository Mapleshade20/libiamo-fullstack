<script lang="ts">
import { invalidateAll } from "$app/navigation";
import { clearAcknowledgedStreak } from "$lib/client/streak-acknowledged";
import { streakPreview } from "$lib/client/streak-preview.svelte";
import StreakDigits from "$lib/components/streak/StreakDigits.svelte";
import StreakFlame from "$lib/components/streak/StreakFlame.svelte";
import { Button } from "$lib/components/ui/button";
import { addDays, localDay } from "$lib/local-day";
import {
	applyQuestCompletion,
	applyReviewObservation,
	emptyStreakRecord,
	type StreakEvent,
	type StreakRecord,
	type StreakStatus,
	type StreakView,
	viewStreak,
} from "$lib/streak";

let { data } = $props();

// ── Panel 1: states ──────────────────────────────────────────────────
const today = $derived(localDay(Date.now() + data.dayOffset * 86_400_000, data.timeZone));

let streakDays = $state(7);
let bank = $state(1);
let status = $state<StreakStatus>("pending");
let taskCount = $state(1);
let reviewCleared = $state(false);

const previewRecord = $derived<StreakRecord>({
	...emptyStreakRecord(),
	streakDays: status === "none" ? 0 : streakDays,
	throughDate: status === "none" ? null : status === "lit" ? today : addDays(today, -1),
	bank,
	progressDate: today,
	taskCount,
	reviewCleared: status === "lit" ? true : reviewCleared,
	bankEarnedToday: 0,
});

$effect(() => {
	streakPreview.set(previewRecord, today);
	return () => streakPreview.clear();
});

type Sample = { label: string; days: number; bank: number; status: StreakStatus };
const contactSheet: Sample[] = [
	{ label: "none", days: 0, bank: 0, status: "none" },
	{ label: "none + badge", days: 0, bank: 2, status: "none" },
	{ label: "pending", days: 4, bank: 0, status: "pending" },
	{ label: "pending + badge", days: 9, bank: 1, status: "pending" },
	{ label: "lit", days: 1, bank: 0, status: "lit" },
	{ label: "lit, two digits", days: 42, bank: 2, status: "lit" },
	{ label: "lit, three digits", days: 365, bank: 3, status: "lit" },
	{ label: "lit, four digits", days: 1024, bank: 3, status: "lit" },
];

// ── Panel 2: animations ──────────────────────────────────────────────
const replays: Array<{ label: string; event: StreakEvent }> = [
	{ label: "ignite", event: { kind: "lit", days: 8, bank: 1 } },
	{ label: "saved day earned", event: { kind: "saved-day-earned", bank: 2 } },
	{ label: "saved day spent", event: { kind: "saved-day-spent", days: 9, spent: 1 } },
	{ label: "streak ends", event: { kind: "broken", previousDays: 12 } },
];

let inspectorIgniting = $state(false);
let inspectorTimer: ReturnType<typeof setTimeout> | undefined;

function replay(event: StreakEvent) {
	streakPreview.play(event);
	if (event.kind !== "lit") return;
	clearTimeout(inspectorTimer);
	inspectorIgniting = false;
	// Restart the inspector copy's animation on the next frame so a repeat click replays it.
	requestAnimationFrame(() => {
		inspectorIgniting = true;
		inspectorTimer = setTimeout(() => (inspectorIgniting = false), 700 * (streakPreview.forceReducedMotion ? 0 : streakPreview.speed));
	});
}

// ── Panel 3: simulation ──────────────────────────────────────────────
type SimulatedDay = { quests: number; cleared: boolean };
const presets: Record<string, SimulatedDay[]> = {
	"perfect week": Array.from({ length: 7 }, () => ({ quests: 1, cleared: true })),
	"one skipped day, covered": [
		{ quests: 3, cleared: true },
		{ quests: 1, cleared: true },
		{ quests: 0, cleared: false },
		{ quests: 1, cleared: true },
	],
	"three skipped days, broken": [
		{ quests: 3, cleared: true },
		{ quests: 0, cleared: false },
		{ quests: 0, cleared: false },
		{ quests: 0, cleared: false },
		{ quests: 1, cleared: true },
	],
	"a ten-quest day": [
		{ quests: 10, cleared: true },
		{ quests: 1, cleared: true },
	],
	"dark day that earns, then pays for itself": [
		{ quests: 1, cleared: true },
		{ quests: 3, cleared: false },
		{ quests: 1, cleared: true },
	],
	"quests after a break": [
		{ quests: 1, cleared: true },
		{ quests: 0, cleared: false },
		{ quests: 0, cleared: false },
		{ quests: 3, cleared: false },
	],
};

let simulation = $state<SimulatedDay[]>(presets["one skipped day, covered"].map((day) => ({ ...day })));
const simulationStart = "2026-09-14";

const simulated = $derived.by(() => {
	let record: StreakRecord | null = null;
	const rows: Array<{ date: string; day: SimulatedDay; view: StreakView }> = [];
	for (const [index, day] of simulation.entries()) {
		const date = addDays(simulationStart, index);
		if (day.cleared) record = applyReviewObservation(record, date, true);
		for (let quest = 0; quest < day.quests; quest++) record = applyQuestCompletion(record, date, day.cleared);
		rows.push({ date, day, view: viewStreak(record, date) });
	}
	return rows;
});

function loadPreset(name: string) {
	simulation = presets[name].map((day) => ({ ...day }));
}

// ── Panel 4: live ────────────────────────────────────────────────────
async function post(action: string, form = new FormData()) {
	await fetch(`?/${action}`, { method: "POST", body: form });
	await invalidateAll();
}

async function travel(days: number) {
	const form = new FormData();
	form.set("days", String(data.dayOffset + days));
	await post("travel", form);
}
</script>

<svelte:head><title>Streak lab</title></svelte:head>

<div class="mx-auto flex max-w-4xl flex-col gap-10 py-8">
	<header>
		<h1 class="font-serif text-3xl">Streak lab</h1>
		<p class="mt-2 text-sm text-muted-foreground">
			Development only. The real navbar indicator above is driven by these controls, so every state and transition is inspected in place rather than
			in a mock.
		</p>
	</header>

	<section class="rounded-lg border border-border p-5">
		<h2 class="font-serif text-xl">1 · States</h2>
		<p class="mt-1 text-xs text-muted-foreground">Overrides the navbar's record on this client only. Nothing is written.</p>
		<div class="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
			<label class="flex flex-col gap-1">
				<span class="text-xs text-muted-foreground">Streak days</span>
				<input type="number" min="0" bind:value={streakDays} class="rounded border border-input bg-background px-2 py-1">
			</label>
			<label class="flex flex-col gap-1">
				<span class="text-xs text-muted-foreground">Saved days</span>
				<input type="number" min="0" max="3" bind:value={bank} class="rounded border border-input bg-background px-2 py-1">
			</label>
			<label class="flex flex-col gap-1">
				<span class="text-xs text-muted-foreground">Status</span>
				<select bind:value={status} class="rounded border border-input bg-background px-2 py-1">
					<option value="lit">lit</option>
					<option value="pending">pending</option>
					<option value="none">none</option>
				</select>
			</label>
			<label class="flex flex-col gap-1">
				<span class="text-xs text-muted-foreground">Quests today</span>
				<input type="number" min="0" bind:value={taskCount} class="rounded border border-input bg-background px-2 py-1">
			</label>
			<label class="flex items-center gap-2 self-end">
				<input type="checkbox" bind:checked={reviewCleared} class="size-4">
				<span>Reviews cleared</span>
			</label>
		</div>

		<div class="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
			{#each contactSheet as sample (sample.label)}
				<div class="flex flex-col items-center gap-2 rounded border border-border/60 p-3">
					<span class="flex items-center gap-1.5">
						<StreakFlame status={sample.status} />
						<span class="relative pr-2 text-sm font-medium">
							<StreakDigits value={sample.days} muted={sample.status !== "lit"} />
							{#if sample.bank > 0}
								<span class="sheet-badge">+{sample.bank}</span>
							{/if}
						</span>
					</span>
					<span class="text-[11px] text-muted-foreground">{sample.label}</span>
				</div>
			{/each}
		</div>
	</section>

	<section class="rounded-lg border border-border p-5">
		<h2 class="font-serif text-xl">2 · Animations</h2>
		<p class="mt-1 text-xs text-muted-foreground">
			Played on the real navbar and on the enlarged copy below at once. Clearing the acknowledged view is what lets a transition play again on the
			next load.
		</p>
		<div class="mt-4 flex flex-wrap items-center gap-2">
			{#each replays as item (item.label)}
				<Button variant="outline" size="sm" onclick={() => replay(item.event)}>{item.label}</Button>
			{/each}
			<Button variant="outline" size="sm" onclick={() => clearAcknowledgedStreak(data.userId)}>clear acknowledged view</Button>
		</div>
		<div class="mt-4 flex flex-wrap items-center gap-6 text-sm">
			<label class="flex items-center gap-2">
				<span class="text-xs text-muted-foreground">Speed</span>
				<input
					type="range"
					min="1"
					max="4"
					step="1"
					value={streakPreview.speed}
					oninput={(event) => (streakPreview.speed = Number(event.currentTarget.value))}
				>
				<span class="tabular-nums text-xs">{(1 / streakPreview.speed).toFixed(2)}×</span>
			</label>
			<label class="flex items-center gap-2">
				<input type="checkbox" bind:checked={streakPreview.forceReducedMotion} class="size-4">
				<span>Force reduced motion</span>
			</label>
		</div>
		<div
			class="mt-5 flex items-center justify-center gap-3 rounded border border-border/60 py-8 text-4xl"
			style="--streak-speed: {streakPreview.forceReducedMotion ? 0 : streakPreview.speed}"
		>
			<StreakFlame
				status={previewRecord.throughDate === today ? "lit" : previewRecord.streakDays > 0 ? "pending" : "none"}
				igniting={inspectorIgniting}
				size={48}
			/>
			<StreakDigits value={previewRecord.streakDays} muted={previewRecord.throughDate !== today} />
		</div>
	</section>

	<section class="rounded-lg border border-border p-5">
		<h2 class="font-serif text-xl">3 · Simulation</h2>
		<p class="mt-1 text-xs text-muted-foreground">
			Day by day through the pure rules, with no database. This is the fast loop for tuning the rules themselves.
		</p>
		<div class="mt-3 flex flex-wrap gap-2">
			{#each Object.keys(presets) as name (name)}
				<Button variant="outline" size="sm" onclick={() => loadPreset(name)}>{name}</Button>
			{/each}
			<Button variant="outline" size="sm" onclick={() => (simulation = [...simulation, { quests: 1, cleared: true }])}>add a day</Button>
		</div>
		<table class="mt-4 w-full text-sm">
			<thead class="text-xs text-muted-foreground">
				<tr class="border-b border-border">
					<th class="py-1 text-left font-normal">Date</th>
					<th class="py-1 text-left font-normal">Quests</th>
					<th class="py-1 text-left font-normal">Reviews</th>
					<th class="py-1 text-right font-normal">Streak</th>
					<th class="py-1 text-right font-normal">Saved</th>
					<th class="py-1 text-right font-normal">Status</th>
				</tr>
			</thead>
			<tbody>
				{#each simulated as row, index (row.date)}
					<tr class="border-b border-border/50">
						<td class="py-1 tabular-nums">{row.date}</td>
						<td class="py-1">
							<input
								type="number"
								min="0"
								max="20"
								value={row.day.quests}
								oninput={(event) => (simulation[index].quests = Math.max(0, Number(event.currentTarget.value)))}
								class="w-16 rounded border border-input bg-background px-1 py-0.5"
							>
						</td>
						<td class="py-1">
							<input
								type="checkbox"
								checked={row.day.cleared}
								onchange={(event) => (simulation[index].cleared = event.currentTarget.checked)}
								class="size-4"
							>
						</td>
						<td class="py-1 text-right tabular-nums">{row.view.days}</td>
						<td class="py-1 text-right tabular-nums">{row.view.bank}</td>
						<td class="py-1 text-right">{row.view.status}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</section>

	<section class="rounded-lg border border-border p-5">
		<h2 class="font-serif text-xl">4 · Live</h2>
		<p class="mt-1 text-xs text-muted-foreground">
			Real writes to your own row through the production server functions. Day travel sets a dev cookie the server and the navbar both honour, so
			"come back tomorrow" is testable without touching the system clock.
		</p>
		<p class="mt-3 text-sm">
			Day offset: <span class="tabular-nums">{data.dayOffset}</span> · today reads as <span class="tabular-nums">{today}</span>
		</p>
		<div class="mt-3 flex flex-wrap gap-2">
			<Button variant="outline" size="sm" onclick={() => travel(1)}>+1 day</Button>
			<Button variant="outline" size="sm" onclick={() => travel(-1)}>−1 day</Button>
			<Button variant="outline" size="sm" onclick={() => post("travel")}>back to today</Button>
			<Button variant="outline" size="sm" onclick={() => post("quest")}>simulate a quest completion</Button>
			<Button variant="outline" size="sm" onclick={() => post("observe")}>simulate a review observation</Button>
			<Button variant="outline" size="sm" onclick={() => post("reset")}>reset my row</Button>
		</div>

		<form method="POST" action="?/setState" class="mt-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
			<label class="flex flex-col gap-1">
				<span class="text-xs text-muted-foreground">streak_days</span>
				<input name="streakDays" type="number" min="0" value={streakDays} class="rounded border border-input bg-background px-2 py-1">
			</label>
			<label class="flex flex-col gap-1">
				<span class="text-xs text-muted-foreground">through_date</span>
				<input name="throughDate" type="date" value={addDays(today, -1)} class="rounded border border-input bg-background px-2 py-1">
			</label>
			<label class="flex flex-col gap-1">
				<span class="text-xs text-muted-foreground">bank</span>
				<input name="bank" type="number" min="0" max="3" value={bank} class="rounded border border-input bg-background px-2 py-1">
			</label>
			<label class="flex flex-col gap-1">
				<span class="text-xs text-muted-foreground">progress_date</span>
				<input name="progressDate" type="date" value={today} class="rounded border border-input bg-background px-2 py-1">
			</label>
			<label class="flex flex-col gap-1">
				<span class="text-xs text-muted-foreground">task_count</span>
				<input name="taskCount" type="number" min="0" value={taskCount} class="rounded border border-input bg-background px-2 py-1">
			</label>
			<label class="flex flex-col gap-1">
				<span class="text-xs text-muted-foreground">bank_earned_today</span>
				<input name="bankEarnedToday" type="number" min="0" max="3" value="0" class="rounded border border-input bg-background px-2 py-1">
			</label>
			<label class="flex items-center gap-2 self-end">
				<input name="reviewCleared" type="checkbox" checked={reviewCleared} class="size-4">
				<span>review_cleared</span>
			</label>
			<Button type="submit" size="sm" class="self-end">write this row</Button>
		</form>
	</section>
</div>

<style>
.sheet-badge {
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
</style>
