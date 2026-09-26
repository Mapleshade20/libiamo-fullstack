<script lang="ts">
import { onDestroy, untrack } from "svelte";
import { getStreakPresentation } from "$lib/components/streak/presentation-state.svelte";
import { streakPreview } from "$lib/components/streak/preview.svelte";
import StreakCompletion from "$lib/components/streak/StreakCompletion.svelte";
import { Button } from "$lib/components/ui/button";
import { historyChanges, type StreakDayMark } from "$lib/streak/history";
import { completionChange, progressOf } from "$lib/streak/presentation";
import { applyQuestCompletion, applyReviewObservation, emptyStreakRecord, type StreakRecord, viewStreak } from "$lib/streak/rules";
import { getDisplayClock } from "$lib/time/display-clock";
import { addDays, localDay } from "$lib/time/local-day";

const clock = getDisplayClock();
const presentation = getStreakPresentation();
let today = $state(untrack(() => localDay(clock().now, clock().timeZone)));
let initialDays = $state(12);
let initialBank = $state(1);
let record = $state<StreakRecord>(untrack(() => ({ ...emptyStreakRecord(), streakDays: 12, throughDate: addDays(today, -1), bank: 1 })));
let surface = $state("home");
let marks = $state<StreakDayMark[]>(untrack(() => seedMarks(12)));
let since = $state(untrack(() => addDays(today, -12)));
let history = $state<string[]>([]);
const view = $derived(viewStreak(record, today));
$effect(() => {
	streakPreview.set(record, today);
	streakPreview.days = marks;
	streakPreview.since = since;
});
onDestroy(() => {
	streakPreview.clear();
	streakPreview.speed = 1;
	streakPreview.forceReducedMotion = false;
	presentation.show = null;
});
function complete(kind: "quest" | "review") {
	const before = { day: today, progress: progressOf(view) };
	const next = kind === "quest" ? applyQuestCompletion(record, today, view.reviewCleared) : applyReviewObservation(record, today, true);
	const days = new Map(marks.map((mark) => [mark.day, mark]));
	for (const mark of historyChanges(record, next, today)) days.set(mark.day, mark);
	marks = [...days.values()];
	record = next;
	surface = kind;
	const after = viewStreak(record, today);
	const event = completionChange(before, after, today);
	history = [
		`${kind === "quest" ? "Quest settled" : "Account-wide reviews cleared"} → ${event ?? "no daily reward to replay"} · ${after.days} days / +${after.bank}`,
		...history,
	].slice(0, 8);
}
function seedMarks(count: number): StreakDayMark[] {
	return Array.from({ length: count }, (_, index) => ({ day: addDays(today, index - count), state: index === count - 4 ? "covered" : "lit" }));
}
function reset() {
	streakPreview.microMotion = "auto";
	const days = Math.max(0, Math.min(9999, Math.trunc(initialDays || 0)));
	marks = seedMarks(days);
	since = addDays(today, -days);
	record = {
		...emptyStreakRecord(),
		streakDays: days,
		throughDate: days ? addDays(today, -1) : null,
		bank: Math.max(0, Math.min(3, Math.trunc(initialBank || 0))),
	};
	surface = "home";
	history = [];
	presentation.show = null;
	streakPreview.set(record, today);
	streakPreview.epoch++;
}
function nextDay() {
	today = addDays(today, 1);
	surface = "home";
	presentation.show = null;
	history = [`Date advanced to ${today} — no day-entry effect (not in this cut)`, ...history].slice(0, 8);
}
</script>
<svelte:head><title>Streak — rehearsal room · Libiamo</title></svelte:head>
<StreakCompletion ready={surface !== "home"} />
<div class="lab">
	<div class="pair motion-toolbar" role="group" aria-label="Micro-motion controls">
		<Button variant="outline" aria-pressed={streakPreview.microMotion === "moving"} onclick={() => { streakPreview.microMotion = "moving"; }}
			>Play micro-motion now</Button
		>
		<Button variant="outline" aria-pressed={streakPreview.microMotion === "static"} onclick={() => { streakPreview.microMotion = "static"; }}
			>Settle to static</Button
		>
		<Button variant="ghost" aria-pressed={streakPreview.microMotion === "auto"} onclick={() => { streakPreview.microMotion = "auto"; }}
			>Resume automatic cycle</Button
		>
	</div>
	<div class="workspace">
		<section class="stage" aria-label="Simulated completion surface">
			<span class="tape"></span><span class="folio">{today} · {surface === "home" ? "QUEST HALL" : "SETTLEMENT"}</span>
			{#if surface === "home"}
				<div class="stage-copy">
					<span class="sketch">✎</span>
					<h2>A little, every day.</h2>
					<p>
						The real homepage bar is above. Click its flame to open the clipboard; leave it still to see the 30-second / 10-second breathing cycle.
					</p>
				</div>
			{:else}
				<div class="stage-copy">
					<span class="complete-mark">✓</span>
					<h2>{surface === "quest" ? "Quest complete." : "Reviews complete."}</h2>
					<p>
						{view.status === "lit" ? "Both promises kept. Today’s flame is yours." : "One promise kept. A small blue spark is waiting for the other."}
					</p>
					<Button variant="outline" onclick={() => { surface = "home"; }}>Back to the hall</Button>
				</div>
			{/if}
			<div class="today-progress">
				<span class:done={view.taskCount > 0}>{view.taskCount > 0 ? "✓" : "□"} Quest · {view.taskCount}</span
				><span class:done={view.reviewCleared}>{view.reviewCleared ? "✓" : "□"} Reviews</span><span>{view.days} days · +{view.bank} saved</span>
			</div>
		</section>
		<aside class="controls">
			<h2>Direct the scene</h2>
			<p>Sandbox only. No account or database writes.</p>
			<div class="events">
				<Button onclick={() => complete("quest")}>Finish a Quest</Button
				><Button variant="outline" onclick={() => complete("review")}>Clear all reviews</Button>
			</div>
			<p class="hint">Try either order. Repeating a completed gate must not replay the daily reward. Three quests can still earn a saved day.</p>
			<div class="rule"></div>
			<label>Starting streak<input aria-label="Starting streak" type="number" min="0" max="9999" bind:value={initialDays}></label>
			<label>Saved days<input aria-label="Saved days" type="number" min="0" max="3" bind:value={initialBank}></label>
			<div class="pair">
				<Button variant="outline" onclick={reset}>Reset rehearsal</Button><Button variant="outline" onclick={nextDay}>Next day</Button>
			</div>
			<label
				>Playback<select bind:value={streakPreview.speed}>
					<option value={.1}>10× — idle timing test</option>
					<option value={1}>1× — real time</option>
					<option value={2}>½× — slow motion</option>
					<option value={4}>¼× — inspect</option>
				</select></label
			>
			<label class="check"><input type="checkbox" bind:checked={streakPreview.forceReducedMotion}> Reduced motion</label>
			<Button variant="ghost" onclick={() => presentation.play(view.status === "lit" ? "ignite" : "kindling")}>Replay current reward</Button>
		</aside>
	</div>
	<section class="event-log" aria-label="Event log">
		<h2>Run log</h2>
		{#if history.length === 0}
			<p>Start with either Quest or reviews. The same production transition rules drive every control.</p>
		{:else}
			<ol>
				{#each history as entry, index}
					<li><span>{String(history.length-index).padStart(2,"0")}</span>{entry}</li>
				{/each}
			</ol>
		{/if}
	</section>
</div>
<style>
.lab {
	padding: 25px 0 55px;
}
.motion-toolbar :global(button) {
	min-height: 44px;
}
.workspace {
	display: grid;
	grid-template-columns: 1fr 290px;
	gap: 30px;
	margin-top: 35px;
}
.stage {
	position: relative;
	display: flex;
	flex-direction: column;
	min-height: 425px;
	background: #fcf9f0;
	border: 1px solid #dcd3c4;
	padding: 28px;
	box-shadow: 4px 5px 0 #e6dfd2;
}
.tape {
	position: absolute;
	top: -11px;
	left: 40%;
	width: 95px;
	height: 25px;
	background: #d4b97566;
	transform: rotate(-4deg);
}
.folio {
	font-size: 10px;
	letter-spacing: 0.08em;
	color: #9c8b74;
}
.stage-copy {
	margin: auto;
	text-align: center;
	max-width: 350px;
	padding: 25px 0;
}
.stage-copy h2 {
	font-family: var(--font-serif);
	font-size: 32px;
	margin: 12px 0;
}
.stage-copy p {
	font-size: 13px;
	color: #91826e;
	line-height: 1.8;
	margin-bottom: 20px;
}
.sketch {
	font-size: 60px;
	color: #a58c61;
}
.complete-mark {
	display: inline-grid;
	place-items: center;
	width: 55px;
	height: 55px;
	border: 2px solid #77836b;
	color: #77836b;
	border-radius: 47% 53% 52% 48%;
	font-size: 35px;
	transform: rotate(-7deg);
}
.today-progress {
	display: flex;
	flex-wrap: wrap;
	justify-content: space-between;
	gap: 12px;
	border-top: 1px solid #e5ddcd;
	padding-top: 17px;
	font-size: 11px;
	color: #9d917e;
}
.done {
	color: #67805f;
}
.controls h2,
.event-log h2 {
	font: 22px var(--font-serif);
}
.controls > p,
.hint {
	font-size: 11px;
	color: #968975;
	line-height: 1.7;
	margin: 10px 0;
}
.events {
	display: grid;
	gap: 9px;
	margin-top: 22px;
}
.rule {
	height: 1px;
	background: #d8cfbf;
	margin: 20px 0;
}
label {
	display: flex;
	justify-content: space-between;
	align-items: center;
	gap: 12px;
	font-size: 12px;
	margin: 12px 0;
}
input[type="number"],
select {
	min-height: 44px;
	border: 1px solid #d3c8b7;
	background: #faf7ef;
	padding: 6px 8px;
	border-radius: 3px;
}
input[type="number"] {
	width: 85px;
}
select {
	max-width: 185px;
}
.pair {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}
.check {
	justify-content: flex-start;
	min-height: 44px;
}
.event-log {
	margin-top: 30px;
	border-top: 1px solid #d9d1c3;
	padding-top: 20px;
}
.event-log p,
.event-log li {
	font-size: 12px;
	color: #958671;
	margin-top: 12px;
}
.event-log li span {
	margin-right: 16px;
	color: #b49d7d;
	font-variant-numeric: tabular-nums;
}
@media (max-width: 760px) {
	.workspace {
		grid-template-columns: 1fr;
	}
	.stage {
		min-height: 320px;
	}
	.controls {
		border-top: 1px solid #d8cfbf;
		padding-top: 20px;
	}
}
</style>
