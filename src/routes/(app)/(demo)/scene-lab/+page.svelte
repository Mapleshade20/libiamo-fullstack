<script lang="ts">
import { base } from "$app/paths";
import type { SimResult } from "./simulate";
import { entryTimes, formatClock, playbackScale } from "./timeline";

let { data } = $props();

const SPEEDS = [1, 4, 16, 64];
const OPENING_SHOWN = 6;

let scenarioId = $state<string | null>(null);
const current = $derived(scenarioId ?? data.scenarios[0]?.id ?? null);
const sessions = $derived(
	data.results
		.filter((result) => result.scenarioId === current)
		.sort((a, b) => data.selected.indexOf(a.run) - data.selected.indexOf(b.run) || a.seed - b.seed)
		.map((result) => ({ result, times: entryTimes(result) })),
);
// One clock for every column, with long silences shortened.
const scale = $derived(playbackScale(sessions.flatMap(({ times }) => [...times.values()])));
const end = $derived(Math.max(0, ...sessions.flatMap(({ times }) => [...times.values()].map(scale))) + 2_000);

let position = $state(0);
let playing = $state(false);
let speed = $state(16);

$effect(() => {
	current;
	position = 0;
	playing = false;
});

$effect(() => {
	if (!playing) return;
	let last = performance.now();
	let frame = requestAnimationFrame(function step(now) {
		position = Math.min(end, position + (now - last) * speed);
		last = now;
		if (position >= end) playing = false;
		else frame = requestAnimationFrame(step);
	});
	return () => cancelAnimationFrame(frame);
});

function toggle() {
	if (position < end) playing = !playing;
	else {
		position = 0;
		playing = true;
	}
}

function view(result: SimResult, times: Map<number, number>) {
	const opening = result.transcript.filter((entry) => entry.opening);
	const shown = result.transcript.filter((entry) => !entry.opening && scale(times.get(entry.id) ?? Infinity) <= position);
	const next = result.transcript.find((entry) => !entry.opening && scale(times.get(entry.id) ?? Infinity) > position);
	const nextAt = next ? scale(times.get(next.id) ?? 0) : Infinity;
	return {
		hidden: Math.max(0, opening.length - OPENING_SHOWN),
		entries: [...opening.slice(-OPENING_SHOWN), ...shown],
		typing: next && next.role === "cast" && nextAt - position < 4_000 * Math.max(1, speed / 4) ? next.author : null,
	};
}

/** Keeps a column scrolled to its newest message while it plays. */
function followNewest(count: number) {
	return (element: HTMLElement) => {
		count;
		element.scrollTop = element.scrollHeight;
	};
}

function depthOf(result: SimResult) {
	const depth = new Map<number, number>();
	for (const entry of result.transcript) depth.set(entry.id, entry.replyTo ? (depth.get(entry.replyTo) ?? 0) + 1 : 0);
	return depth;
}

function runsHref(run: string) {
	const next = data.selected.includes(run) ? data.selected.filter((item) => item !== run) : [...data.selected, run];
	return `${base}/scene-lab?runs=${next.join(",")}`;
}
</script>

<svelte:head><title>Scene Lab</title></svelte:head>

<div class="mx-auto max-w-[1900px] px-4 py-6">
	<header class="mb-4 flex flex-wrap items-baseline gap-3">
		<h1>Scene Lab</h1>
		<nav class="flex flex-wrap gap-1.5 text-xs" aria-label="Runs">
			{#each data.runs as run}
				<a class="rounded border px-2 py-1 {data.selected.includes(run) ?'bg-foreground text-background' : ''}" href={runsHref(run)}>{run}</a>
			{/each}
		</nav>
	</header>

	<div class="mb-3 flex flex-wrap gap-1.5 text-sm" role="tablist" aria-label="Scenarios">
		{#each data.scenarios as scenario}
			<button
				type="button"
				role="tab"
				aria-selected={scenario.id === current}
				class="min-h-11 rounded-full border px-3 text-sm {scenario.id === current ?'bg-foreground text-background' : ''}"
				onclick={() => (scenarioId = scenario.id)}
			>
				{scenario.label}
			</button>
		{/each}
	</div>

	<div class="sticky top-0 z-10 mb-4 flex flex-wrap items-center gap-3 rounded-lg border bg-card p-2 shadow-sm">
		<button type="button" class="min-h-11 min-w-20 rounded border px-3" onclick={toggle}>{playing ? "Pause" : "Play"}</button>
		{#each SPEEDS as option}
			<button
				type="button"
				class="min-h-11 rounded border px-3 text-sm {speed === option ?'bg-foreground text-background' : ''}"
				onclick={() => (speed = option)}
			>
				{option}×
			</button>
		{/each}
		<input type="range" class="min-w-60 flex-1 accent-foreground" min="0" max={end} step="250" bind:value={position} aria-label="Playback position">
		<span class="tabular-nums text-sm text-muted-foreground">{formatClock(position)} / {formatClock(end)}</span>
	</div>

	<div class="flex gap-4 overflow-x-auto pb-4">
		{#if current && data.references[current]}
			<article class="max-h-[80vh] w-[420px] shrink-0 overflow-y-auto rounded-lg border border-warning/30 bg-warning/[0.08] p-3 text-[13px]">
				<h3 class="font-semibold">The real conversation</h3>
				<pre class="mt-2 font-sans whitespace-pre-wrap">{data.references[current]}</pre>
			</article>
		{/if}
		{#each sessions as { result, times } (`${result.run}/${result.id}`)}
			{@const shown = view(result, times)}
			{@const depth = depthOf(result)}
			<article
				class="max-h-[75vh] w-[440px] shrink-0 overflow-y-auto rounded-lg border bg-card p-3 text-[13px] shadow-sm"
				{@attach followNewest(shown.entries.length)}
			>
				<h3 class="font-semibold">{result.run} · {result.variant} · seed {result.seed}</h3>
				{#if !result.finishedAt}
					<p class="mt-1 text-xs text-warning">running… {result.turns.length} turns</p>
				{/if}
				{#if shown.hidden}
					<p class="mt-3 text-xs text-muted-foreground">… {shown.hidden} earlier opening messages</p>
				{/if}
				<ol class="mt-2 space-y-1.5">
					{#each shown.entries as entry, index (entry.id)}
						{@const at = times.get(entry.id)}
						{@const before = shown.entries[index - 1]}
						{@const gap = at !== undefined && before && times.has(before.id) ? at - (times.get(before.id) ?? 0) : 0}
						{#if gap > 120_000}
							<li class="py-1 text-center text-xs text-muted-foreground">— {formatClock(gap)} later —</li>
						{/if}
						<li
							class="rounded px-2 py-1 transition-colors duration-700 {entry.role ==='learner' ? 'bg-success/[0.07]' : entry.opening ? 'text-muted-foreground' : 'bg-sky-50'} {at !== undefined && position - scale(at) < 1_500 * speed ? 'ring-2 ring-amber-300' : ''}"
							style:margin-left="{Math.min(depth.get(entry.id) ?? 0, 6) * 14}px"
						>
							<span class="text-xs text-muted-foreground"
								>#{entry.id}{entry.replyTo ? ` ↪${entry.replyTo}` : ""}{at !== undefined ? ` · ${formatClock(at)}` : ""}</span
							>
							<b>{entry.author}</b>
							{#if entry.subject}
								<i class="text-muted-foreground">[{entry.subject}]</i>
							{/if}
							<span class="whitespace-pre-wrap">{entry.text}</span>
						</li>
					{/each}
				</ol>
				{#if shown.typing}
					<p class="mt-2 text-xs text-muted-foreground italic">{shown.typing} is typing…</p>
				{/if}
			</article>
		{/each}
	</div>
</div>
