<script lang="ts">
import type { VesselKind } from "./drinks";

/*
 * What a drink is poured from, drawn about its mouth (the origin), its body hanging below: the scene turns it about
 * the mouth to pour. Clear vessels show what is inside, in the drink's colour.
 */
let { kind, colour, corked = false, cut = false }: { kind: VesselKind; colour: string; corked?: boolean; cut?: boolean } = $props();
const SHAPES: Record<VesselKind, { body: string; fill: string; clear?: boolean; label?: string; extra?: string; band?: string }> = {
	shaker: {
		body: "M-2.4 0H2.4V3.2L5.8 9.4V10H-5.8V9.4L-2.4 3.2ZM-6 10H6L5 26.6Q0 28.2 -5 26.6Z",
		fill: "#cdd3d8",
		band: "M-6 10H6M-5.6 16H5.6",
	},
	beer: {
		body: "M-1.9 0H1.9L2 9C2 12 5.2 13 5.2 16.4V31Q5.2 33.2 3 33.2H-3Q-5.2 33.2 -5.2 31V16.4C-5.2 13 -2 12 -2 9Z",
		fill: "#8d4f22",
		label: "M-5.2 19.4H5.2V27H-5.2Z",
	},
	jug: {
		body: "M-5.4 0.4Q-2.4 -0.8 0 0.6Q2.6 -0.4 4.6 0.2L4.2 3.4C9.6 6.4 9.6 22.6 6.4 27Q0 29.4 -6.4 27C-9.6 22.6 -9.6 6.4 -4.2 3.4Z",
		fill: "#c46b46",
		extra: "M6.4 7C11.6 7.4 11.8 18.6 7.2 20.4",
		band: "M-8.4 12.4Q0 14.2 8.4 12.4",
	},
	champagne: {
		body: "M-1.9 0H1.9L2.1 11C2.1 15 6.2 15.4 6.2 19.6V34.4Q6.2 36.6 4 36.6H-4Q-6.2 36.6 -6.2 34.4V19.6C-6.2 15.4 -2.1 15 -2.1 11Z",
		fill: "#2f5a44",
		label: "M-6.2 23H6.2V30.4H-6.2Z",
		band: "M-2 0H2L2.1 7.6H-2.1Z",
	},
	decanter: {
		body: "M-1.7 0H1.7V6C8 8.2 9.2 13 9.2 19.2C9.2 27 4.6 30.4 0 30.4S-9.2 27 -9.2 19.2C-9.2 13 -8 8.2 -1.7 6Z",
		fill: "#eef3f5",
		clear: true,
		extra: "M-5 13.6L-6.4 24M5 13.6L6.4 24",
	},
	carafe: {
		body: "M-2.6 0H2.6V5C7 8 7.6 12 7.6 18V28Q7.6 30.2 5.4 30.2H-5.4Q-7.6 30.2 -7.6 28V18C-7.6 12 -7 8 -2.6 5Z",
		fill: "#eef3f5",
		clear: true,
	},
	rum: {
		body: "M-2 0H2V7C2 9 7 9.2 7 12.4V27Q7 29.2 4.8 29.2H-4.8Q-7 29.2 -7 27V12.4C-7 9.2 -2 9 -2 7Z",
		fill: "#eef3f5",
		clear: true,
		label: "M-7 16H7V23.4H-7Z",
	},
};
const s = $derived(SHAPES[kind]);
// What shows inside a clear vessel: its lower part, below a line across it.
const inside = $derived(kind === "decanter" ? "M-9.4 17H9.4V31H-9.4Z" : kind === "carafe" ? "M-8 13H8V31H-8Z" : "M-7.2 12H7.2V30H-7.2Z");
const id = $props.id();
</script>

{#if cut}
	<!-- Its paper only: the glass composites every part's paper first, so no white edge falls inside the sticker. -->
	{#if s.extra && kind === "jug"}
		<path class="cut cut-line" d={s.extra} />
	{/if}
	<path class="cut" d={s.body} />
	{#if corked}
		<path class="cut" d="M-2.4 0.4V-3.4Q0 -6 2.4 -3.4V0.4Z" />
	{/if}
{:else}
	<defs>
		<clipPath id="v-{id}"><path d={s.body} /></clipPath>
	</defs>
	<path class="fill" style:--c={s.fill} d={s.body} />
	{#if s.clear}
		<path class="fill" style:--c={colour} d={inside} clip-path="url(#v-{id})" opacity="0.92" />
	{/if}
	{#if s.band}
		<path class={kind === "champagne" ? "fill foil" : "thin"} d={s.band} />
	{/if}
	{#if s.label}
		<path class="fill label" d={s.label} />
		<path class="thin" d={s.label} />
	{/if}
	{#if s.extra}
		<path class={kind === "jug" ? "handle" : "thin"} d={s.extra} />
		{#if kind === "jug"}
			<path class="handle-fill" style:--c={s.fill} d={s.extra} />
		{/if}
	{/if}
	<path class="ink" d={s.body} />
	<path class="shine" d={kind === "decanter" ? "M-6.4 14C-7 18 -6.4 22 -5 24.4" : "M-3.2 15V25"} />
	{#if corked}
		<!-- The cork, until it goes (the scene flies it on its own). -->
		<path class="ink fill" style:--c="#d7ae74" d="M-1.7 0.4V-3.4H1.7V0.4Z" />
		<path class="ink fill" style:--c="#d7ae74" d="M-2.4 -3.4Q0 -6 2.4 -3.4Z" />
	{/if}
{/if}

<style>
.cut {
	fill: var(--paper);
	stroke: var(--paper);
	stroke-width: calc(var(--w) * 3);
	stroke-linejoin: round;
}
.cut-line {
	fill: none;
	stroke-width: calc(var(--w) * 4.4);
	stroke-linecap: round;
}
.fill {
	fill: var(--c);
}
.foil {
	--c: #d8b24c;
	stroke: var(--line);
	stroke-width: calc(var(--w) * 0.6);
}
.label {
	--c: #f6efdf;
}
.ink {
	fill: none;
	stroke: var(--line);
	stroke-width: calc(var(--w) * 0.8);
	stroke-linejoin: round;
	stroke-linecap: round;
}
.ink.fill {
	fill: var(--c);
}
.thin {
	fill: none;
	stroke: var(--line);
	stroke-width: calc(var(--w) * 0.6);
	stroke-linecap: round;
	opacity: 0.6;
}
.handle {
	fill: none;
	stroke: var(--line);
	stroke-width: calc(var(--w) * 2.8);
	stroke-linecap: round;
}
.handle-fill {
	fill: none;
	stroke: var(--c);
	stroke-width: calc(var(--w) * 1.2);
	stroke-linecap: round;
}
.shine {
	fill: none;
	stroke: #fff;
	stroke-width: calc(var(--w) * 0.9);
	stroke-linecap: round;
	opacity: 0.55;
}
</style>
