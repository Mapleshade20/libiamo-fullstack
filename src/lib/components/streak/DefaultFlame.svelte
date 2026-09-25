<script lang="ts">
import { onMount, untrack } from "svelte";
import burn from "./art/burn.svg";
import gray from "./art/gray.svg";
import type { StreakArtProps } from "./skin";

let { appearance, ignite = false, moving = false, reduced = false, speed = 1, onready, onrise, onigniteend }: StreakArtProps = $props();
let svg = $state<SVGSVGElement>();
let pilotBody = $state<SVGGElement>();
let loaded = $state(false);
let player = $state<import("./art/flame-player.js").FlamePlayer>();
let failed = $state(false);
let playingIgnition = false;
let rose = false;
function camera() {
	if (!player || !svg) return;
	const stage = player.state.stage;
	// Start the calendar fade 0.3s before the settled upper pose (103 at 30fps).
	if (stage === "ignite" && player.state.time * 30 >= 94 && !rose) {
		rose = true;
		onrise?.();
	}
	const progress = Math.max(0, Math.min(1, (player.state.time * 30 - 32) / 71));
	const ease = progress * progress * (3 - 2 * progress);
	// Follow the rising source origin without switching zoom or clipping its shockwave.
	const y = stage === "ignite" ? 295 - 200 * ease : stage === "off" ? 295 : 95;
	svg.setAttribute("viewBox", `155 ${y} 255 270`);
	// Ash stays translucent on light paper; warmth restores full density during ignition.
	svg.style.opacity = String(
		stage === "off" ? 0.72 : stage === "ignite" ? 0.72 + 0.28 * Math.max(0, Math.min(1, (player.state.time * 30 - 32) / 6)) : 1,
	);
	if (pilotBody) {
		const angle = Math.sin((player.phase * Math.PI) / 1.2) * 3 * player.amount;
		pilotBody.setAttribute("transform", `rotate(${angle} 40 82)`);
	}
}
onMount(() => {
	let cancelled = false;
	Promise.all([import("./art/flame-player.js"), import("./art/flame-data.json")])
		.then(([runtime, data]) => {
			if (cancelled || !svg) return;
			player = new runtime.FlamePlayer(svg, { data: data.default });
			player.addEventListener("framechange", camera);
			player.addEventListener("ended", () => {
				playingIgnition = false;
				onigniteend?.();
			});
			loaded = true;
			onready?.();
		})
		.catch(() => {
			if (!cancelled) {
				failed = true;
				onready?.();
			}
		});
	return () => {
		cancelled = true;
		player?.destroy();
	};
});
$effect(() => {
	const instance = player;
	const state = appearance;
	const shouldIgnite = ignite && !reduced;
	const rate = speed;
	if (!instance) {
		if (failed && ignite) onigniteend?.();
		return;
	}
	untrack(() => {
		instance.setSpeed(1 / Math.max(0.1, rate));
		if (shouldIgnite) {
			playingIgnition = true;
			rose = false;
			instance.setStage("ignite", { autoplay: true, settle: moving ? "idle" : "static" });
		} else {
			playingIgnition = false;
			instance.setState(state === "burn" ? "burn-static" : "gray-static");
			instance.setMotion(moving && !reduced, { duration: reduced ? 0 : 850 * rate });
			if (ignite) onigniteend?.();
		}
		camera();
	});
});
$effect(() => {
	const instance = player;
	const active = moving && !reduced;
	const rate = speed;
	if (instance)
		untrack(() => {
			if (!playingIgnition) instance.setMotion(active, { duration: reduced ? 0 : 850 * rate });
		});
});
</script>
<span class="art" class:reduced style="--art-tempo: {speed}">
	{#if !loaded || failed}
		<img class="fallback" src={appearance === "burn" ? burn : gray} alt="">
	{/if}
	<svg bind:this={svg} class:loaded aria-hidden="true" focusable="false"></svg>
	{#if appearance === "kindling"}
		<svg class="pilot" viewBox="0 0 80 90" aria-hidden="true">
			<g bind:this={pilotBody}>
				<path fill="#4d9faf" d="M40 4C43 25 66 33 65 57C64 77 51 84 38 83C19 83 10 69 13 54C16 42 23 36 25 27C26 44 34 45 34 45C30 28 37 18 40 4Z" />
				<path fill="#b1e4df" d="M39 42C41 53 51 58 49 68C47 78 31 79 28 68C25 58 35 54 39 42Z" />
			</g>
		</svg>
	{/if}
</span>
<style>
.art {
	display: block;
	position: relative;
	width: 100%;
	height: 100%;
}
svg,
.fallback {
	width: 100%;
	height: 100%;
	object-fit: contain;
	display: block;
}
svg {
	overflow: visible;
}
svg:not(.pilot) {
	opacity: 0;
}
svg.loaded {
	opacity: 1;
}
.fallback {
	position: absolute;
	inset: 0;
}
.pilot {
	position: absolute;
	width: 51%;
	height: 53%;
	bottom: 5%;
	left: 24%;
	transform-origin: 50% 90%;
	animation: pilot-in calc(650ms * var(--art-tempo)) cubic-bezier(0.2, 0.8, 0.2, 1) both;
}
.reduced .pilot {
	animation: none;
}
@keyframes pilot-in {
	from {
		transform: scale(0.05);
		opacity: 0;
	}
	to {
		transform: scale(1);
		opacity: 1;
	}
}
@media (prefers-reduced-motion: reduce) {
	.pilot {
		animation: none;
	}
}
</style>
