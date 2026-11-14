<script lang="ts">
import type { Drink, GarnishKind } from "./drinks";

/*
 * The last touches, each drawn about its own origin in the sticker hand (warm ink, flat colour, a shine). `cut` draws
 * only its paper (the white die cut), which the glass composites under everything, so only the outermost edge of the
 * whole sticker shows white. `open` is how far the umbrella has opened or the crown risen; `spin` turns the umbrella
 * about its stick, and runs the crown's drip down the glass.
 */
let {
	kind,
	tint,
	open = 1,
	spin = 0,
	drink,
	cut = false,
}: { kind: GarnishKind; tint?: string; open?: number; spin?: number; drink: Drink; cut?: boolean } = $props();
const crown = $derived.by(() => {
	if (kind !== "crown") return null;
	const n = (v: number) => v.toFixed(2);
	const w = drink.rim.rx;
	const h = 5.2 * open;
	// One head of foam over the whole mouth: it hangs a little over the rim all round (so the rim is under it), domes
	// up in three soft lobes, and spills down the outside of the glass in two drips that end in round drops.
	const d = `M${n(-w - 1.5)} 0.4C${n(-w - 1.2)} 1.9 ${n(-w * 0.55)} 2.9 ${n(-w * 0.3)} 2.4C${n(-w * 0.05)} 3.1 ${n(w * 0.35)} 3.2 ${n(w * 0.55)} 2.5C${n(w * 0.8)} 2.9 ${n(w + 1.3)} 2 ${n(w + 1.5)} 0.3C${n(w + 2.3)} ${n(-h * 0.25)} ${n(w + 0.9)} ${n(-h * 0.85)} ${n(w * 0.55)} ${n(-h * 0.8)}C${n(w * 0.4)} ${n(-h * 1.3)} ${n(-w * 0.12)} ${n(-h * 1.4)} ${n(-w * 0.2)} ${n(-h * 1.0)}C${n(-w * 0.45)} ${n(-h * 1.3)} ${n(-w - 1)} ${n(-h * 1.05)} ${n(-w - 1.2)} ${n(-h * 0.35)}C${n(-w - 2.1)} ${n(-h * 0.1)} ${n(-w - 1.9)} 0 ${n(-w - 1.5)} 0.4Z`;
	const drop = (x: number, top: number, len: number, r: number) =>
		len < 0.4
			? ""
			: `M${n(x - r)} ${n(top)}L${n(x - r * 0.75)} ${n(top + len)}A${n(r * 1.05)} ${n(r * 1.05)} 0 1 0 ${n(x + r * 0.75)} ${n(top + len)}L${n(x + r)} ${n(top)}Z`;
	const drips = [drop(w - 0.3, 1, 8 * Math.max(0.35, spin) * open, 1.9), drop(-w * 0.4, 2.2, 3.6 * Math.max(0.3, spin) * open, 1.6)].filter(Boolean);
	return { d, drips, w, h };
});
// Turning, the panels' seams slide round the dome (each seam's x is where a meridian crosses the side view).
const seams = $derived(Array.from({ length: 12 }, (_, i) => Math.sin((i / 12) * 2 * Math.PI + spin)));
// The seams on the near side of the dome (the far ones are hidden behind it).
const front = $derived(
	Array.from({ length: 12 }, (_, i) => (i / 12) * 2 * Math.PI + spin)
		.filter((a) => Math.cos(a) > 0.15)
		.map(Math.sin),
);
// A paper umbrella from the side: a shallow dome over a scalloped hem, panels fanning from its tip.
const CANOPY = "M-8.6 2.4Q-7.8 -3.8 0 -5.4Q7.8 -3.8 8.6 2.4Q6.45 0.4 4.3 1.9Q2.15 0.4 0 1.9Q-2.15 0.4 -4.3 1.9Q-6.45 0.4 -8.6 2.4Z";
const id = $props.id();
const STRAW = "M0 16V-21L-5 -27";
const STRAWBERRY = "M0 5.6C-3.6 3.6 -4.8 0 -4 -2.2S-1.4 -4.4 0 -3.4C1.4 -4.4 3.2 -4.4 4 -2.2S3.6 3.6 0 5.6Z";
const MINT = "M-6 1C-5 -3 -2 -4 0 -1C1 -5 5 -5 6 -1C4 2 1 2 0 0C-2 3 -5 3 -6 1Z";
// A citrus wheel, whole or halved (the half sits on the rim by its cut edge).
const rind = $derived(tint ?? "#e8892f");
</script>

{#if cut}
	{#if kind === "cherry-pick"}
		<path class="cut line" d="M0 -11V6" />
		<circle class="cut" cx="0" cy="2.4" r="3.4" />
	{:else if kind === "wheel"}
		<circle class="cut" r="5.4" />
	{:else if kind === "half-wheel"}
		<path class="cut" d="M-6.2 0A6.2 6.2 0 0 1 6.2 0Z" />
	{:else if kind === "fruit-cube"}
		<rect class="cut" x="-2" y="-2" width="4" height="4" rx="0.9" />
	{:else if kind === "strawberry"}
		<path class="cut" d={STRAWBERRY} />
		<path class="cut" d="M-3 -5.4L0 -6.6L3 -5.4L0 -3Z" />
	{:else if kind === "ice"}
		<rect class="cut" x="-3.6" y="-3.6" width="7.2" height="7.2" rx="1.6" />
	{:else if kind === "umbrella"}
		<path class="cut line" d="M0 12V-13" />
		<g transform="translate(0 -13) scale({Math.max(0.12, open)} 1)"><path class="cut" d={CANOPY} /></g>
	{:else if kind === "straw"}
		<path class="cut line" d={STRAW} />
	{:else if kind === "mint"}
		<path class="cut" d={MINT} />
	{:else if kind === "crown" && crown}
		{#each crown.drips as d}
			<path class="cut" {d} />
		{/each}
		<path class="cut" d={crown.d} />
	{/if}
{:else if kind === "cherry-pick"}
	<path class="ink" d="M0 -11V6" />
	<path class="pick" d="M0 -10.6V5.6" />
	<circle class="fill" style:--c="#d42f3f" cx="0" cy="2.4" r="3.4" />
	<path class="fill" style:--c="#9e1c2c" d="M3.3 1.8A3.4 3.4 0 0 1 -2.6 4.6Q1.8 4.6 3.3 1.8Z" />
	<circle class="ink" cx="0" cy="2.4" r="3.4" />
	<ellipse class="gloss" cx="-1.3" cy="0.9" rx="1.05" ry="0.7" transform="rotate(-30 -1.3 0.9)" />
	<circle class="ink fill" style:--c="#e9c46a" cx="0" cy="-11.4" r="1.15" />
{:else if kind === "wheel"}
	<circle class="fill" style:--c={rind} r="5.4" />
	<circle class="fill" style:--c="#fbf1d8" r="4.4" />
	<circle class="fill" style:--c="color-mix(in oklch, {rind} 62%, #fff)" r="3.7" />
	<path class="thin" d="M0 -3.7V3.7M-3.2 -1.85 3.2 1.85M-3.2 1.85 3.2 -1.85" />
	<circle class="ink" r="5.4" />
{:else if kind === "half-wheel"}
	<path class="fill" style:--c={rind} d="M-6.2 0A6.2 6.2 0 0 1 6.2 0Z" />
	<path class="fill" style:--c="#fbf1d8" d="M-5.1 0A5.1 5.1 0 0 1 5.1 0Z" />
	<path class="fill" style:--c="color-mix(in oklch, {rind} 62%, #fff)" d="M-4.3 0A4.3 4.3 0 0 1 4.3 0Z" />
	<path class="thin" d="M0 0V-4.3M0 0L-3.7 -2.15M0 0L3.7 -2.15" />
	<path class="ink" d="M-6.2 0A6.2 6.2 0 0 1 6.2 0Z" />
{:else if kind === "fruit-cube"}
	<rect class="ink fill" style:--c={tint} x="-2" y="-2" width="4" height="4" rx="0.9" />
	<path class="shine" d="M-1 -1h1.2" />
{:else if kind === "strawberry"}
	<path class="ink fill" style:--c="#d93b45" d={STRAWBERRY} />
	<path class="ink fill" style:--c="#5e9f4c" d="M0 -3.4L-3 -5.4L-1.2 -3.6L-1.6 -6.6L0 -4.2L1.6 -6.6L1.2 -3.6L3 -5.4Z" />
	<g class="seeds">
		<circle cx="-1.8" cy="-0.6" r="0.4" />
		<circle cx="1.2" cy="-1" r="0.4" />
		<circle cx="-0.4" cy="1.6" r="0.4" />
		<circle cx="1.8" cy="1.6" r="0.4" />
		<circle cx="-1.6" cy="2.8" r="0.4" />
	</g>
	<path class="shine" d="M-2.8 -1.2q.2 -1.4 1.4 -1.6" />
{:else if kind === "ice"}
	<rect class="ink fill" style:--c="#eaf5f8" x="-3.6" y="-3.6" width="7.2" height="7.2" rx="1.6" />
	<path class="thin" d="M-1.6 3.6V1.2H3.6" />
	<path class="shine" d="M-2.2 -2.2h2.2M-2.2 -2.2v1.6" />
{:else if kind === "umbrella"}
	<path class="ink" d="M0 12V-13" />
	<path class="pick" d="M0 11.6V-12.6" />
	<g transform="translate(0 -13) scale({Math.max(0.12, open)} 1)">
		<defs>
			<clipPath id="umb-{id}"><path d={CANOPY} /></clipPath>
		</defs>
		<path class="fill" style:--c="#fdf6e8" d={CANOPY} />
		<g clip-path="url(#umb-{id})">
			{#each seams as x, i (i)}
				{#if i % 2 === 0}
					{@const x2 = seams[(i + 1) % 12]}
					{#if x2 > x}
						<path class="fill" style:--c={tint} d="M0 -5.4L{x * 9.2} 3L{x2 * 9.2} 3Z" />
					{/if}
				{/if}
			{/each}
		</g>
		<path class="thin" d={front.map((x) => `M0 -5.4L${(x * 8.6).toFixed(2)} 2`).join("")} />
		<path class="ink" d={CANOPY} />
	</g>
	<circle class="ink fill" style:--c="#e9c46a" cx="0" cy="-18.6" r="0.95" />
{:else if kind === "straw"}
	<path class="straw-ink" d={STRAW} />
	<path class="straw" d={STRAW} />
	<path class="straw-stripe" style:--c={tint} d={STRAW} />
{:else if kind === "mint"}
	<path class="ink fill" style:--c="#4f9a4a" d="M0 0C-2 3 -5 3 -6 1C-5 -3 -2 -4 0 0Z" />
	<path class="ink fill" style:--c="#62b05a" d="M0 0C1 -5 5 -5 6 -1C4 2 1 2 0 0Z" />
	<path class="ink fill" style:--c="#3f8a3c" d="M0 0C-1.6 -2.4 -1 -6 1 -7C2.4 -5 1.8 -2 0 0Z" />
	<path class="thin" d="M0 0L-4 1M0 0L4 -1.6M0 0L.8 -5" />
{:else if kind === "crown" && crown}
	<!-- The head and its drips are one body of foam: all outlines first, then all the foam over them. -->
	{#each [crown.d, ...crown.drips] as d}
		<path class="foam-edge" {d} />
	{/each}
	{#each [crown.d, ...crown.drips] as d}
		<path class="foam-fill" {d} />
	{/each}
	<!-- A little shade where the lobes meet, and a few bubbles: fine lines, no outline of their own. -->
	<path class="thin" d="M{-crown.w * 0.2} {-crown.h * 0.95}q.6 1.4 2 1.9M{crown.w * 0.5} {-crown.h * 0.75}q.2 1.2 1.4 1.6" />
	<g class="foam-bubbles">
		<circle cx={-crown.w * 0.55} cy={-crown.h * 0.4} r="0.45" />
		<circle cx={crown.w * 0.2} cy={-crown.h * 0.5} r="0.35" />
	</g>
{/if}

<style>
.cut {
	fill: var(--paper);
	stroke: var(--paper);
	stroke-width: calc(var(--w) * 3);
	stroke-linejoin: round;
	stroke-linecap: round;
}
.cut.line {
	fill: none;
	stroke-width: calc(var(--w) * 4.6);
}
.ink {
	/* Small things inside the sticker take a fine line, never the glass's. */
	fill: none;
	stroke: var(--line);
	stroke-width: calc(var(--w) * 0.5);
	stroke-linejoin: round;
	stroke-linecap: round;
}
.fill,
.ink.fill {
	fill: var(--c);
}
.thin {
	fill: none;
	stroke: var(--line);
	stroke-width: calc(var(--w) * 0.4);
	stroke-linecap: round;
	opacity: 0.5;
}
.shine {
	fill: none;
	stroke: #fff;
	stroke-width: calc(var(--w) * 0.85);
	stroke-linecap: round;
	opacity: 0.75;
}
.pick {
	fill: none;
	stroke: #e8d6ae;
	stroke-width: calc(var(--w) * 0.45);
}
.gloss {
	fill: #fff;
	opacity: 0.85;
}
.foam-edge {
	fill: var(--line);
	stroke: var(--line);
	stroke-width: calc(var(--w) * 1.6);
	stroke-linejoin: round;
}
.foam-fill {
	fill: #fbf5e8;
}
.foam-bubbles {
	fill: none;
	stroke: var(--line);
	stroke-width: calc(var(--w) * 0.35);
	opacity: 0.45;
}
.seeds {
	fill: #fbe3a0;
}
.straw-ink {
	fill: none;
	stroke: var(--line);
	stroke-width: calc(var(--w) * 2.5);
	stroke-linejoin: round;
	stroke-linecap: round;
}
.straw {
	fill: none;
	stroke: #fdf9f0;
	stroke-width: calc(var(--w) * 1.5);
	stroke-linejoin: round;
	stroke-linecap: round;
}
.straw-stripe {
	fill: none;
	stroke: var(--c);
	stroke-width: calc(var(--w) * 1.5);
	stroke-dasharray: 2.2 2.2;
	stroke-linejoin: round;
}
</style>
