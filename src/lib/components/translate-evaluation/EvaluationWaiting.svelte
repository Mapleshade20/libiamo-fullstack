<script lang="ts">
import { type AnimationPlaybackControls, animate } from "motion";
import { onDestroy } from "svelte";
import { prefersReducedMotion, stopAll } from "./motion";
import { MOTION_TOKENS } from "./types";

interface Props {
	/** Localized status title, e.g. "Evaluating". */
	title: string;
	/** When true, show Retry instead of looping animation. */
	failed?: boolean;
	retryLabel?: string;
	failedBody?: string;
	onretry?: () => void;
}

let {
	title,
	failed = false,
	retryLabel = "Retry",
	failedBody = "Something went wrong while evaluating. Your draft is saved.",
	onretry,
}: Props = $props();

let svgEl: SVGSVGElement | null = $state(null);
let controls: AnimationPlaybackControls[] = [];
let loopTimer: ReturnType<typeof setTimeout> | null = null;

function collect() {
	if (!svgEl) return { paths: [] as SVGPathElement[], nodes: [] as SVGCircleElement[], glyphs: [] as SVGGElement[] };
	return {
		paths: Array.from(svgEl.querySelectorAll<SVGPathElement>("[data-frame-path]")),
		nodes: Array.from(svgEl.querySelectorAll<SVGCircleElement>("[data-frame-node]")),
		glyphs: Array.from(svgEl.querySelectorAll<SVGGElement>("[data-frame-glyph]")),
	};
}

function clearInlineOpacity(el: Element) {
	// Motion often drives SVG presentation attributes; inline style opacity would win and freeze the frame.
	(el as HTMLElement | SVGElement).style.removeProperty("opacity");
}

function resetVisuals() {
	const { paths, nodes, glyphs } = collect();
	for (const p of paths) {
		clearInlineOpacity(p);
		p.setAttribute("opacity", "0");
		p.style.removeProperty("stroke-dasharray");
		p.style.removeProperty("stroke-dashoffset");
	}
	for (const n of nodes) {
		clearInlineOpacity(n);
		n.setAttribute("opacity", "0");
	}
	for (const g of glyphs) {
		clearInlineOpacity(g);
		g.setAttribute("opacity", "0");
	}
}

function showStatic() {
	const { paths, nodes, glyphs } = collect();
	for (const p of paths) {
		clearInlineOpacity(p);
		p.setAttribute("opacity", "1");
		p.style.removeProperty("stroke-dasharray");
		p.style.removeProperty("stroke-dashoffset");
	}
	for (const n of nodes) {
		clearInlineOpacity(n);
		n.setAttribute("opacity", "1");
	}
	for (const g of glyphs) {
		clearInlineOpacity(g);
		g.setAttribute("opacity", "0.85");
	}
}

function runLoop() {
	stopAll(controls);
	controls = [];
	if (loopTimer) {
		clearTimeout(loopTimer);
		loopTimer = null;
	}
	if (!svgEl) return;

	if (failed) {
		showStatic();
		return;
	}

	const reduced = prefersReducedMotion();
	if (reduced) {
		showStatic();
		const titleEl = document.getElementById("eval-waiting-title");
		if (titleEl) {
			controls.push(animate(titleEl, { opacity: [0.55, 1, 0.55] }, { duration: 2.4, repeat: Infinity, ease: "easeInOut" }));
		}
		return;
	}

	const { paths, nodes, glyphs } = collect();
	resetVisuals();

	const pathDuration = 0.7;
	const nodeDuration = 0.28;
	const gap = 0.12;
	let at = 0;

	const pushNode = (i: number) => {
		const el = nodes[i];
		if (!el) return;
		controls.push(
			animate(
				el,
				{ opacity: [0, 1], scale: [0.6, 1] },
				{ duration: nodeDuration, delay: at, ease: [...MOTION_TOKENS.easeOut] as [number, number, number, number] },
			),
		);
	};
	const pushPath = (i: number) => {
		const el = paths[i];
		if (!el) return;
		controls.push(
			animate(el, { pathLength: [0, 1], opacity: [0, 1] } as Record<string, number[]>, {
				duration: pathDuration,
				delay: at,
				ease: [...MOTION_TOKENS.easeInOut] as [number, number, number, number],
			}),
		);
	};
	const pushGlyph = (i: number, extra = 0.2) => {
		const el = glyphs[i];
		if (!el) return;
		controls.push(
			animate(
				el,
				{ opacity: [0, 0.9], scale: [0.85, 1] },
				{
					duration: 0.35,
					delay: at + extra,
					ease: [...MOTION_TOKENS.easeOut] as [number, number, number, number],
				},
			),
		);
	};

	// Order: TL node → left path → BL → bottom → BR → right → TR → top
	pushNode(0);
	at += nodeDuration + gap;
	pushPath(0);
	pushGlyph(0);
	at += pathDuration + gap;
	pushNode(1);
	at += nodeDuration + gap;
	pushPath(1);
	pushGlyph(1);
	at += pathDuration + gap;
	pushNode(2);
	at += nodeDuration + gap;
	pushPath(2);
	pushGlyph(2);
	at += pathDuration + gap;
	pushNode(3);
	at += nodeDuration + gap;
	pushPath(3);
	pushGlyph(3, 0.15);
	at += pathDuration + 0.6;

	loopTimer = setTimeout(() => {
		const targets = [...paths, ...nodes, ...glyphs] as Element[];
		if (targets.length === 0 || failed) return;
		const fade = animate(targets, { opacity: 0 }, { duration: 0.45, ease: "easeInOut" });
		controls.push(fade);
		void fade.then(() => {
			if (!failed) runLoop();
		});
	}, at * 1000);
}

$effect(() => {
	failed;
	svgEl;
	const id = requestAnimationFrame(() => runLoop());
	return () => {
		cancelAnimationFrame(id);
		if (loopTimer) clearTimeout(loopTimer);
		stopAll(controls);
	};
});

onDestroy(() => {
	if (loopTimer) clearTimeout(loopTimer);
	stopAll(controls);
});
</script>

<section
	class="mx-auto flex min-h-[calc(100dvh-10rem)] w-full max-w-3xl flex-col items-center justify-center text-center"
	aria-live="polite"
	aria-busy={!failed}
>
	<svg bind:this={svgEl} viewBox="0 0 200 200" width="180" height="180" class="text-foreground/70" aria-hidden="true">
		<!-- Frame paths: left, bottom, right, top -->
		<path data-frame-path d="M 40 48 L 40 152" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0" />
		<path data-frame-path d="M 40 152 L 160 152" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0" />
		<path data-frame-path d="M 160 152 L 160 48" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0" />
		<path data-frame-path d="M 160 48 L 40 48" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0" />

		<!-- Corner nodes: TL BL BR TR -->
		<circle data-frame-node cx="40" cy="48" r="4.5" fill="currentColor" opacity="0" />
		<circle data-frame-node cx="40" cy="152" r="4.5" fill="currentColor" opacity="0" />
		<circle data-frame-node cx="160" cy="152" r="4.5" fill="currentColor" opacity="0" />
		<circle data-frame-node cx="160" cy="48" r="4.5" fill="currentColor" opacity="0" />

		<!-- Decorative glyphs -->
		<g data-frame-glyph opacity="0">
			<path d="M 62 78 L 78 94 L 62 110" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" />
		</g>
		<g data-frame-glyph opacity="0">
			<circle cx="100" cy="100" r="10" fill="none" stroke="currentColor" stroke-width="1.25" />
			<circle cx="100" cy="100" r="3" fill="currentColor" />
		</g>
		<g data-frame-glyph opacity="0">
			<path d="M 122 78 L 138 78 L 138 110 L 122 110 Z" fill="none" stroke="currentColor" stroke-width="1.25" />
		</g>
		<g data-frame-glyph opacity="0">
			<path d="M 88 128 L 112 128" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" />
			<path d="M 94 134 L 106 134" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" />
		</g>
	</svg>

	<h1 id="eval-waiting-title" class="font-serif text-3xl tracking-tight text-foreground">{title}</h1>

	{#if failed}
		<p class="mt-3 max-w-sm text-sm text-muted-foreground">{failedBody}</p>
		<button
			type="button"
			class="mt-6 inline-flex h-10 items-center justify-center rounded-md border border-transparent bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/85 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
			onclick={() => onretry?.()}
		>
			{retryLabel}
		</button>
	{/if}
</section>
