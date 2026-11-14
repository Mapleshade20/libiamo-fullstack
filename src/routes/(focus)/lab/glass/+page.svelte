<script lang="ts">
import FocusBar from "$lib/components/shell/FocusBar.svelte";
import { DRINKS } from "$lib/components/streak/glass/drinks";
import Glass from "$lib/components/streak/glass/Glass.svelte";
import type { Look, Moment } from "$lib/components/streak/glass/scene";
import Button from "$lib/components/ui/button/button.svelte";

/*
 * The week's glasses, every look and moment of each, for judging them (dev only; recordings drive it by URL:
 * ?d=<index>&m=<moment>&speed=<x> plays one moment on load).
 */
const params = typeof location !== "undefined" ? new URLSearchParams(location.search) : new URLSearchParams();
let speed = $state(Number(params.get("speed") ?? 1));
const only = params.get("d");
const manual = params.has("manual");
if (manual && typeof window !== "undefined")
	Object.assign(window, {
		__glass: {
			start: (i: number, m: Moment, from: Look) => {
				looks[i] = from;
				return new Promise<void>((r) =>
					setTimeout(() => {
						stages[i].play(m, m === "swap" ? DRINKS[(i + 1) % 7] : undefined);
						r();
					}, 50),
				);
			},
			step: (i: number, s: number) => stages[i].advance(s),
			look: (i: number, l: Look) => (looks[i] = l),
		},
	});
const shown = only === null ? DRINKS.map((d, i) => i) : [Number(only)];
let looks = $state<Look[]>(DRINKS.map(() => "down"));
const stages: Glass[] = $state([]);
const MOMENTS: { m: Moment; from: Look; label: string }[] = [
	{ m: "flip", from: "down", label: "Flip" },
	{ m: "pour", from: "up", label: "Pour" },
	{ m: "spill", from: "full", label: "Spill" },
	{ m: "swap", from: "down", label: "Next day" },
	{ m: "unflip", from: "up", label: "Unflip" },
];
const IDLES: Moment[] = ["jitter", "tip", "hop", "scoot", "slosh", "swirl", "fizz", "clink", "twirl", "bob"];
async function run(i: number, m: Moment, from?: Look) {
	if (from) looks[i] = from;
	await Promise.resolve();
	await stages[i]?.play(m, m === "swap" ? DRINKS[(i + 1) % 7] : undefined);
	const c = stages[i]?.current();
	if (c) looks[i] = c.look;
}
async function all(i: number) {
	looks[i] = "down";
	await new Promise((r) => setTimeout(r, 300));
	for (const m of ["flip", "pour", "spill"] as Moment[]) {
		await run(i, m);
		await new Promise((r) => setTimeout(r, 900 / speed));
	}
}
$effect(() => {
	const m = params.get("m") as Moment | null;
	if (!m || only === null || manual) return;
	const from = (params.get("from") as Look | null) ?? MOMENTS.find((x) => x.m === m)?.from ?? "full";
	const i = Number(only);
	looks[i] = from;
	const t = setTimeout(() => (m === ("all" as Moment) ? all(i) : run(i, m, from)), Number(params.get("delay") ?? 600));
	return () => clearTimeout(t);
});
</script>

<FocusBar exit={{ label: "Home", href: "/" }} />
<main class="lab">
	<h1>The week's glasses</h1>
	<label class="speed">Speed <input type="range" min="0.1" max="1" step="0.05" bind:value={speed}> {speed.toFixed(2)}×</label>
	{#each shown as i (i)}
		{@const d = DRINKS[i]}
		<section class="drink">
			<div class="icons">
				<h2>{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i]} · {d.name}</h2>
				<div class="row">
					{#each ["down", "up", "full"] as l (l)}
						<div class="cell"><Glass drink={d} look={l as Look} size={36} idle /><span>{l}</span></div>
					{/each}
					<div class="cell"><Glass drink={d} look="full" size={22} /><span>22</span></div>
				</div>
			</div>
			<div class="stage" data-stage={i}>
				<Glass bind:this={stages[i]} drink={d} look={looks[i]} size={180} stage {speed} {manual} />
			</div>
			<div class="btns">
				{#each MOMENTS as x (x.m)}
					<Button size="sm" variant="secondary" onclick={() => run(i, x.m, x.from)}>{x.label}</Button>
				{/each}
				<Button size="sm" onclick={() => all(i)}>All</Button>
				<span class="sep"></span>
				{#each IDLES as m (m)}
					<Button size="sm" variant="ghost" onclick={() => run(i, m)}>{m}</Button>
				{/each}
				<span class="sep"></span>
				{#each ["down", "up", "full"] as l (l)}
					<Button size="sm" variant="ghost" onclick={() => (looks[i] = l as Look)}>= {l}</Button>
				{/each}
			</div>
		</section>
	{/each}
</main>

<style>
.lab {
	width: min(1100px, 100% - 40px);
	margin: 0 auto;
	padding: 12px 0 96px;
}
.speed {
	display: flex;
	gap: 8px;
	align-items: center;
	font-size: 13px;
	color: var(--muted);
	margin: 6px 0 18px;
}
.drink {
	display: grid;
	grid-template-columns: 260px 200px 1fr;
	gap: 18px;
	align-items: center;
	padding: 14px 0;
	border-top: 1px solid var(--line-soft);
}
h2 {
	font-size: 18px;
	margin: 0 0 8px;
}
.row {
	display: flex;
	gap: 14px;
	align-items: flex-end;
}
.cell {
	display: grid;
	justify-items: center;
	gap: 4px;
	font-size: 11px;
	color: var(--muted);
}
.stage {
	/* Clipped like the week's popover, so what leaves the stage leaves the view. */
	overflow: hidden;
	display: grid;
	place-items: center;
	padding: 6px;
	border-radius: 8px;
	background: var(--raised);
	box-shadow: var(--paper-lift);
}
.btns {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	align-items: center;
}
.sep {
	width: 100%;
}
</style>
