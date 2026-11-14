<script lang="ts">
import { onDestroy, untrack } from "svelte";
import { MediaQuery } from "svelte/reactivity";
import { type Drink, insidePath } from "./drinks";
import Garnish from "./Garnish.svelte";
import { type Look, type Moment, Scene } from "./scene";
import Vessel from "./Vessel.svelte";

/*
 * The week's glass: upside down until something is done today, upright and empty after one of the two, poured and
 * garnished when the day counts. It runs its physics only while something moves (a moment, or a small motion every
 * 15 to 20 seconds when `idle`), only while the page is visible, and not at all under reduced motion.
 * `stage` leaves room above the glass for the vessel and the splash (the week's popover); the icon is cropped close.
 */
let {
	drink,
	look,
	size = 36,
	stage = false,
	idle = false,
	speed = 1,
	inkPx,
	manual = false,
}: { drink: Drink; look: Look; size?: number; stage?: boolean; idle?: boolean; speed?: number; inkPx?: number; manual?: boolean } = $props();

const reduced = new MediaQuery("(prefers-reduced-motion: reduce)", false);
const scene = untrack(() => new Scene(drink, look));
let frame = $state(0);
let raf = 0;
let last = 0;
const id = $props.id();

function loop(now: number) {
	const dt = ((now - last) / 1000) * speed;
	last = now;
	const busy = scene.tick(dt);
	frame++;
	raf = busy ? requestAnimationFrame(loop) : 0;
}
function wake() {
	if (raf || manual || typeof window === "undefined") return;
	last = performance.now();
	raf = requestAnimationFrame(loop);
}
onDestroy(() => {
	// Whoever waits on a moment hears that it ended.
	scene.finish();
	if (raf) cancelAnimationFrame(raf);
	clearTimeout(idleTimer);
});

/** Play a moment; resolves when its hand lets go. Under reduced motion it lands on its end at once. */
export function play(moment: Moment, next?: Drink): Promise<void> {
	return new Promise((resolve) => {
		scene.play(moment, resolve, next);
		if (reduced.current) {
			scene.finish();
			frame++;
			return;
		}
		wake();
	});
}
/** Step by hand (recordings): advance the scene by `seconds` and draw it. */
export function advance(seconds: number) {
	scene.tick(seconds);
	frame++;
	return scene.busy;
}
/** Where things stand now (a moment changes the look; the parent can read it back). */
export const current = () => ({ look: scene.look, drink: scene.drink, busy: scene.busy });

// A new look or drink from outside, with nothing playing: shown at rest.
$effect(() => {
	const l = look;
	const d = drink;
	untrack(() => {
		if (scene.moment) return;
		if (scene.look !== l || scene.drink !== d) {
			scene.setLook(l, d);
			frame++;
		}
	});
});

// The small motions: every 15 to 20 seconds, while visible, if nothing else is moving.
let idleTimer: ReturnType<typeof setTimeout> | undefined;
$effect(() => {
	if (!idle || reduced.current) return;
	const schedule = () => {
		clearTimeout(idleTimer);
		if (document.hidden) return;
		idleTimer = setTimeout(
			() => {
				if (!scene.busy) {
					const pool: Moment[] =
						scene.look === "full"
							? ["slosh", ...scene.drink.idles, ...scene.drink.idles]
							: scene.drink.up[1] < 14
								? ["jitter", "hop", "scoot"]
								: ["jitter", "tip", "hop", "tip"];
					scene.play(pool[Math.floor(Math.random() * pool.length)]);
					wake();
				}
				schedule();
			},
			15_000 + Math.random() * 5_000,
		);
	};
	schedule();
	document.addEventListener("visibilitychange", schedule);
	return () => {
		clearTimeout(idleTimer);
		document.removeEventListener("visibilitychange", schedule);
	};
});

/* ---------- What to draw ---------- */
// The icon is cropped close and scaled per glass, so a squat tumbler reads as large as a tall flute.
const zoom = $derived(stage ? 1 : Math.max(0.9, Math.min(1.42, 46 / Math.max(drink.height, drink.rim.rx * 2 + 4))));
const box = $derived(stage ? { x: -50, y: -78, w: 100, h: 84 } : { x: -29 / zoom, y: -55 / zoom, w: 58 / zoom, h: 58 / zoom });
const ink = $derived((inkPx ?? (stage ? 2 : 1.3)) / (size / box.w));
const v = $derived.by(() => {
	void frame;
	const d = scene.drink;
	return {
		d,
		transform: scene.transform,
		liquid: scene.fill > 0 ? scene.liquidPath() : "",
		above: scene.fill > 0 ? scene.abovePath() : "",
		deep: scene.fill > 0 ? scene.deepPath() : "",
		sink: scene.sinkPath(),
		band: scene.sinkPath(2.6),
		foam: scene.foamPath(),
		top: scene.topPath(),
		stream: scene.streamPath(),
		items: scene.items.filter((i) => i.on).map((i) => ({ ...i })),
		drops: scene.drops.map((p) => ({ ...p })),
		vessel: scene.vessel?.on ? { ...scene.vessel, cork: { ...scene.vessel.cork } } : null,
		sparkles: scene.sparkles.map((s) => ({ ...s })),
		marks: scene.marks.map((s) => ({ ...s })),
		shadow: { x: scene.x, lift: Math.max(0, -scene.y) },
		up: !scene.upsideDown,
	};
});
const inside = $derived(insidePath(v.d));
// The inside up to the rim only (the liquid never shows above it, however the glass leans).
const insideRim = $derived(insidePath(v.d, false));
const crowned = $derived(v.items.some((i) => i.g.kind === "crown" && !i.world));
/** A curve drawn as a stroke that thins from the full line to a fine one: sampled, offset either side, closed. */
function taper([x0, y0, x1, y1, x2, y2, x3, y3]: number[], w0: number, w1: number) {
	const left: string[] = [];
	const right: string[] = [];
	for (let i = 0; i <= 14; i++) {
		const t = i / 14;
		const u = 1 - t;
		const x = u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3;
		const y = u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3;
		const dx = 3 * u * u * (x1 - x0) + 6 * u * t * (x2 - x1) + 3 * t * t * (x3 - x2);
		const dy = 3 * u * u * (y1 - y0) + 6 * u * t * (y2 - y1) + 3 * t * t * (y3 - y2);
		const len = Math.hypot(dx, dy) || 1;
		const half = (w0 + (w1 - w0) * t ** 1.3) / 2;
		left.push(`${(x - (dy / len) * half).toFixed(2)} ${(y + (dx / len) * half).toFixed(2)}`);
		right.unshift(`${(x + (dy / len) * half).toFixed(2)} ${(y - (dx / len) * half).toFixed(2)}`);
	}
	return `M${left.join("L")}L${right.join("L")}Z`;
}
const flares = $derived((v.d.flares ?? []).map((c) => taper(c, ink, ink * 0.3)));
const stands = (k: string) => inGlass(k) || k === "straw" || k === "umbrella";
const rimFar = $derived(`M${-v.d.rim.rx} ${v.d.rim.y}A${v.d.rim.rx} ${v.d.rim.ry} 0 0 1 ${v.d.rim.rx} ${v.d.rim.y}`);
const rimNear = $derived(`M${-v.d.rim.rx} ${v.d.rim.y}A${v.d.rim.rx} ${v.d.rim.ry} 0 0 0 ${v.d.rim.rx} ${v.d.rim.y}`);
const inGlass = (k: string) => k === "fruit-cube" || k === "ice" || k === "mint" || k === "cherry-pick";
const stretch = (p: { vx: number; vy: number; r: number }) => {
	const sp = Math.hypot(p.vx, p.vy);
	const k = Math.min(2.2, 1 + sp / 260);
	return { rx: p.r * k, ry: p.r / Math.sqrt(k), deg: (Math.atan2(p.vy, p.vx) * 180) / Math.PI };
};
const star = (s: number) =>
	`M0 ${-s}Q${s * 0.18} ${-s * 0.18} ${s} 0Q${s * 0.18} ${s * 0.18} 0 ${s}Q${-s * 0.18} ${s * 0.18} ${-s} 0Q${-s * 0.18} ${-s * 0.18} 0 ${-s}Z`;
</script>

<svg
	class="glass"
	class:stage
	viewBox="{box.x} {box.y} {box.w} {box.h}"
	width={size}
	height={size * (box.h / box.w)}
	style:--w={ink}
	aria-hidden="true"
	focusable="false"
>
	<defs>
		<clipPath id="in-{id}"><path d={insideRim} /></clipPath>
		<clipPath id="open-{id}"><path d={inside} /></clipPath>
		{#if v.liquid}
			<clipPath id="liq-{id}"><path d={v.liquid} /></clipPath>
			<clipPath id="above-{id}"><path d={v.above} /></clipPath>
		{/if}
	</defs>
	{#if stage}
		<ellipse
			class="shadow"
			cx={v.shadow.x}
			cy="0.8"
			rx={(v.up ? v.d.up[0] : v.d.down[0]) * 1.15 * (1 - Math.min(0.5, v.shadow.lift / 60))}
			ry="1.5"
			opacity={0.18 * (1 - Math.min(0.8, v.shadow.lift / 40))}
		/>
	{/if}

	<!-- Paper first, every part's, so the white die cut shows only round the outside of the whole sticker. -->
	<g transform={v.transform}>
		<path class="cut" d={v.d.body} />
		{#each v.items as it, i (i)}
			{#if !it.world && !inGlass(it.g.kind)}
				<g transform="translate({it.x} {it.y}) rotate({it.a}){it.g.flip ? " scale(-1 1)" : ""}">
					<Garnish cut kind={it.g.kind} open={it.s} spin={it.spin} drink={v.d} />
				</g>
			{/if}
		{/each}
	</g>
	{#if v.vessel}
		<g transform="translate({v.vessel.x} {v.vessel.y}) rotate({v.vessel.a})">
			<Vessel cut kind={v.vessel.pour.vessel} colour={v.vessel.pour.colour} corked={v.vessel.cork.on && !v.vessel.cork.out} />
		</g>
	{/if}

	<!-- The glass, back to front: its pale body, the far half of its rim and its floor, then the drink. -->
	<g transform={v.transform}>
		<path class="body" d={v.d.body} />
		<path class="rim far" d={rimFar} />
		{#if v.d.far}
			<path class="floor" d={v.d.far} />
		{/if}
		{#if v.d.base}
			<ellipse class="floor" cx="0" cy={v.d.base.y} rx={v.d.base.rx} ry={v.d.base.ry} />
		{/if}
		{#if v.liquid}
			<g clip-path="url(#in-{id})">
				<path class="liquid" style:--c={v.d.liquid} d={v.liquid} />
				{#if !v.d.sinks}
					<path class="deep" style:--c={v.d.liquid} d={v.deep} clip-path="url(#liq-{id})" />
				{/if}
				{#if v.sink}
					<path style:fill="color-mix(in oklch, {v.d.liquid} 50%, {v.d.sinks?.colour})" d={v.band} />
					<path style:fill={v.d.sinks?.colour} d={v.sink} />
				{/if}
				{#each v.drops as p, i (i)}
					{#if p.kind === "bubble" && p.age > 0}
						<circle class="bubble" cx={p.x} cy={p.y} r={p.r} />
					{/if}
					{#if p.kind === "plume" && p.age > 0}
						<circle style:fill={p.c} cx={p.x} cy={p.y} r={p.r} />
					{/if}
				{/each}
			</g>
			<g clip-path="url(#open-{id})">
				{#if v.foam}
					<path class="foam" d={v.foam} />
				{/if}
				{#if v.top && !crowned}
					<path class="top" style:--c={v.foam ? "#fdf9ef" : v.d.surface} d={v.top} />
				{/if}
			</g>
		{/if}
		<!-- What stands in the drink: below the surface it is seen through the drink, above it as itself. -->
		{#each v.items as it, i (i)}
			{#if !it.world && stands(it.g.kind)}
				<g clip-path={it.g.kind !== "cherry-pick" && it.g.kind !== "umbrella" ? `url(#open-${id})` : undefined}>
					{#if v.liquid}
						<g class="through" clip-path="url(#liq-{id})">
							<g transform="translate({it.x} {it.y}) rotate({it.a}){it.g.flip ? " scale(-1 1)" : ""}">
								<Garnish kind={it.g.kind} tint={it.g.tint} open={it.s} spin={it.spin} drink={v.d} />
							</g>
						</g>
					{/if}
					<g clip-path={v.liquid ? `url(#above-${id})` : undefined}>
						<g transform="translate({it.x} {it.y}) rotate({it.a}){it.g.flip ? " scale(-1 1)" : ""}">
							<Garnish kind={it.g.kind} tint={it.g.tint} open={it.s} spin={it.spin} drink={v.d} />
						</g>
					</g>
				</g>
			{/if}
		{/each}
	</g>

	{#if v.stream}
		<path class="stream-ink" d={v.stream} />
		<path class="stream" style:--c={v.vessel?.pour.colour ?? v.d.liquid} d={v.stream} />
	{/if}

	<!-- Its walls and the near half of its rim, over everything inside it; then what sits on the rim. -->
	<g transform={v.transform}>
		{#each v.d.ink as d}
			<path class="ink" {d} />
		{/each}
		{#each flares as d}
			<path class="flare" {d} />
		{/each}
		{#if v.d.lip}
			<path class="lip" d={v.d.lip} />
		{/if}
		<path class="rim" d={rimNear} />
		<path class="shine" d={v.d.shine} />
		{#each v.items as it, i (i)}
			{#if !it.world && !stands(it.g.kind)}
				<g transform="translate({it.x} {it.y}) rotate({it.a}){it.g.flip ? " scale(-1 1)" : ""}">
					<Garnish kind={it.g.kind} tint={it.g.tint} open={it.s} spin={it.spin} drink={v.d} />
				</g>
			{/if}
		{/each}
	</g>

	{#if v.vessel}
		<g transform="translate({v.vessel.x} {v.vessel.y}) rotate({v.vessel.a})">
			<Vessel kind={v.vessel.pour.vessel} colour={v.vessel.pour.colour} corked={v.vessel.cork.on && !v.vessel.cork.out} />
		</g>
		{#if v.vessel.cork.out && v.vessel.cork.on}
			<g transform="translate({v.vessel.cork.x} {v.vessel.cork.y}) rotate({v.vessel.cork.a})">
				<path class="fine cork" d="M-1.7 0.4V-3.4H1.7V0.4Z" />
				<path class="fine cork" d="M-2.4 -3.4Q0 -6 2.4 -3.4Z" />
			</g>
		{/if}
	{/if}

	{#each v.items as it, i (i)}
		{#if it.world}
			<g transform="translate({it.x} {it.y}) rotate({it.a}){it.g.flip ? " scale(-1 1)" : ""}">
				<Garnish kind={it.g.kind} tint={it.g.tint} open={it.s} spin={it.spin} drink={v.d} />
			</g>
		{/if}
	{/each}
	<!-- Drops in two passes, ink then colour, so drops that touch read as one body of liquid with one outline. -->
	{#each [true, false] as edge (edge)}
		{#each v.drops as p, i (i)}
			{#if p.kind !== "bubble" && p.kind !== "plume" && p.age > 0 && p.life - p.age > 0.04}
				{@const s = stretch(p)}
				{@const fade = Math.min(1, (p.life - p.age) * 5)}
				<ellipse
					class={edge ? "drop-ink" : "drop"}
					style:--c={p.c ?? v.d.liquid}
					transform="translate({p.x} {p.y}) rotate({s.deg})"
					rx={s.rx * fade + (edge ? ink * 0.3 : 0)}
					ry={s.ry * fade + (edge ? ink * 0.3 : 0)}
				/>
			{/if}
		{/each}
	{/each}
	{#each v.sparkles as s, i (i)}
		{#if s.age > 0}
			{@const k = Math.sin(Math.PI * Math.min(1, s.age / s.life))}
			<path class="sparkle" transform="translate({s.x} {s.y}) rotate({s.age * 120})" d={star(s.size * k)} />
		{/if}
	{/each}
	{#each v.marks as m, i (i)}
		{@const k = m.age / m.life}
		<path
			class="mark"
			opacity={1 - k}
			d="M{m.x + Math.sign(m.size) * k * 3} -1.2l{Math.sign(m.size) * 3 * Math.abs(m.size)} -1.6M{m.x + Math.sign(m.size) * k * 3} -4.4l{Math.sign(
				m.size,
			) *
				2.4 *
				Math.abs(m.size)} -3"
		/>
	{/each}
</svg>

<style>
.glass {
	display: block;
	overflow: visible;
	--line: var(--nav-line, oklch(0.32 0.018 55));
	--paper: var(--nav-paper, #fff);
	filter: drop-shadow(0 1px 1.2px rgb(40 32 24 / 0.28));
}
:global([data-theme="dark"]) .glass {
	filter: drop-shadow(0 1px 1.2px rgb(0 0 0 / 0.5));
}
.cut {
	fill: var(--paper);
	stroke: var(--paper);
	stroke-width: calc(var(--w) * 2.8);
	stroke-linejoin: round;
}
.body {
	fill: color-mix(in oklch, var(--acc-blue, #8fa3b1) 14%, #fff);
}
.liquid {
	fill: var(--c);
	fill-opacity: 0.9;
}
/* The drink is deeper low in the glass: a darker, warmer shade of itself. */
.deep {
	fill: color-mix(in oklch, var(--c) 80%, #3b2412);
	fill-opacity: 0.55;
}
/* Below the surface, a thing is seen through the drink: tinted by it. */
.through {
	mix-blend-mode: multiply;
	opacity: 0.8;
}
.floor {
	fill: none;
	stroke: var(--line);
	stroke-width: calc(var(--w) * 0.5);
	opacity: 0.55;
}
.flare {
	fill: var(--line);
}
.lip {
	fill: none;
	stroke: var(--line);
	stroke-width: calc(var(--w) * 0.55);
}
.rim.far {
	stroke-width: calc(var(--w) * 0.6);
	opacity: 0.8;
}
.foam {
	fill: #fbf5e8;
}
.top {
	fill: var(--c);
	stroke: var(--line);
	stroke-width: calc(var(--w) * 0.4);
}
.bubble {
	fill: #fff;
	fill-opacity: 0.75;
}
.ink {
	fill: none;
	stroke: var(--line);
	stroke-width: var(--w);
	stroke-linejoin: round;
	stroke-linecap: round;
}
.rim {
	fill: none;
	stroke: var(--line);
	stroke-width: var(--w);
	stroke-linecap: round;
}
.shine {
	fill: none;
	stroke: #fff;
	stroke-width: calc(var(--w) * 1);
	stroke-linecap: round;
	opacity: 0.8;
}
.stream-ink {
	fill: none;
	stroke: var(--line);
	stroke-width: calc(var(--w) * 1.9);
	stroke-linecap: round;
	stroke-linejoin: round;
}
.stream {
	fill: none;
	stroke: var(--c);
	stroke-width: calc(var(--w) * 1.25);
	stroke-linecap: round;
	stroke-linejoin: round;
}
.drop {
	fill: var(--c);
}
.drop-ink {
	fill: var(--line);
}
.sparkle {
	fill: #f3d36b;
	stroke: var(--line);
	stroke-width: calc(var(--w) * 0.35);
	stroke-linejoin: round;
}
.mark {
	fill: none;
	stroke: var(--line);
	stroke-width: calc(var(--w) * 0.7);
	stroke-linecap: round;
}
.fine {
	stroke: var(--line);
	stroke-width: calc(var(--w) * 0.5);
	stroke-linejoin: round;
}
.cork {
	fill: #d7ae74;
}
.shadow {
	fill: var(--line);
}
</style>
