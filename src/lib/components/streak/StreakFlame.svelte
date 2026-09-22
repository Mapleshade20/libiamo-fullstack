<script lang="ts">
import { dev } from "$app/environment";
import { streakPreview } from "$lib/client/streak-preview.svelte";
import type { StreakStatus } from "$lib/streak";
import type { FlameAppearance } from "$lib/streak-presentation";
import { streakSkin } from "./skin";

let {
	status = "pending",
	appearance,
	igniting = false,
	size = 38,
	idle = true,
	continuous = false,
	onready,
	onrise,
	onigniteend,
}: {
	status?: StreakStatus;
	appearance?: FlameAppearance;
	igniting?: boolean;
	size?: number;
	idle?: boolean;
	continuous?: boolean;
	onready?: () => void;
	onrise?: () => void;
	onigniteend?: () => void;
} = $props();
let moving = $state(false);
let reduced = $state(false);
const forced = $derived(dev && streakPreview.forceReducedMotion);
const speed = $derived(dev ? streakPreview.speed : 1);
const microMotion = $derived(dev && streakPreview.record ? streakPreview.microMotion : "auto");
const Art = streakSkin.Art;
$effect(() => {
	const media = matchMedia("(prefers-reduced-motion: reduce)");
	const update = () => {
		reduced = media.matches;
	};
	update();
	media.addEventListener("change", update);
	return () => media.removeEventListener("change", update);
});
$effect(() => {
	if (!idle || reduced || forced) {
		moving = false;
		return;
	}
	let timer: ReturnType<typeof setTimeout>;
	const mode = microMotion;
	const schedule = () => {
		moving = false;
		clearTimeout(timer);
		if (document.hidden) return;
		if (mode !== "auto") {
			moving = mode === "moving";
			return;
		}
		timer = setTimeout(() => {
			moving = true;
			timer = setTimeout(schedule, 10_000 * speed);
		}, 30_000 * speed);
	};
	schedule();
	document.addEventListener("visibilitychange", schedule);
	return () => {
		clearTimeout(timer);
		document.removeEventListener("visibilitychange", schedule);
	};
});
</script>
<span class="flame" style:width="{size}px" style:height="{size}px" aria-hidden="true">
	<Art
		appearance={appearance ?? (status === "lit" ? "burn" : "gray")}
		ignite={igniting}
		moving={moving || continuous}
		reduced={reduced || forced}
		{speed}
		{onready}
		{onrise}
		{onigniteend}
	/>
</span>
<style>
.flame {
	display: inline-block;
	flex-shrink: 0;
	vertical-align: middle;
}
</style>
