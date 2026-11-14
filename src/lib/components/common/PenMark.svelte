<script lang="ts">
import { annotate } from "rough-notation";
import { onMount, type Snippet } from "svelte";

/*
 * Words marked by hand: a pen stroke (underline, circle, box, highlight or bracket) drawn in once, in the wine ink the
 * app keeps for meaningful marks (rough-notation). Under reduced motion it is simply there.
 */
let {
	type = "underline",
	delay = 300,
	padding = 4,
	color,
	children,
}: {
	type?: "underline" | "circle" | "box" | "highlight" | "bracket";
	delay?: number;
	padding?: number;
	color?: string;
	children: Snippet;
} = $props();
let el: HTMLElement | undefined = $state();
onMount(() => {
	if (!el) return;
	const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
	const ink = color ?? getComputedStyle(document.documentElement).getPropertyValue("--wine").trim();
	// A highlight lies under the words, so it is a wash of the ink, not the ink itself (full wine left dark text
	// unreadable on it). SVG strokes take rgba, not color-mix.
	const dark = document.documentElement.dataset.theme === "dark";
	const wash = (hex: string, a: number) => {
		const m = /^#([0-9a-f]{6})$/i.exec(hex);
		if (!m) return hex;
		const n = parseInt(m[1], 16);
		return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
	};
	const a = annotate(el, {
		type,
		color: type === "highlight" ? wash(ink, dark ? 0.32 : 0.2) : ink,
		padding,
		strokeWidth: type === "highlight" ? 1 : 1.8,
		animate: !reduced,
		animationDuration: 700,
		iterations: 1,
		multiline: true,
	});
	const t = setTimeout(() => a.show(), reduced ? 0 : delay);
	return () => {
		clearTimeout(t);
		a.remove();
	};
});
</script>

<!-- The stroke is drawn into the wrapper, which is positioned, so it stays with the words whatever moves around them. -->
<span class="pen"><span bind:this={el}>{@render children()}</span></span>

<style>
.pen {
	position: relative;
	white-space: nowrap;
}
</style>
