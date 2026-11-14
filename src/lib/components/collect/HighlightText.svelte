<script lang="ts">
import type { Collector } from "./collector.svelte";

/*
 * A text the learner can highlight to keep phrases from (marker ink behind the words, joined across the spaces).
 * Drag across words with a mouse; on a touch screen tap a word, then a neighbour to stretch the mark. A mark that
 * touches another joins it; tapping a mark removes it. Each mark goes to the page's collector.
 */
let {
	text,
	lang,
	block,
	collector,
	class: className = "",
}: { text: string; lang: string; block: string; collector: Collector; class?: string } = $props();
const segs = $derived([...new Intl.Segmenter(lang, { granularity: "word" }).segment(text)]);
const sentences = $derived([...new Intl.Segmenter(lang, { granularity: "sentence" }).segment(text)]);
type Mark = { n: number; a: number; b: number };
let marks = $state<Mark[]>([]);
let nextN = 1;
let preview = $state<[number, number] | null>(null);
let pending = $state<number | null>(null);
const isWord = (i: number) => !!segs[i]?.isWordLike;
const prevWord = (i: number) => {
	for (let k = i - 1; k >= 0; k--) if (isWord(k)) return k;
	return -1;
};
const nextWord = (i: number) => {
	for (let k = i + 1; k < segs.length; k++) if (isWord(k)) return k;
	return -1;
};
const markAt = (i: number) => marks.find((m) => i >= m.a && i <= m.b);
const textOf = (m: Mark) => text.slice(segs[m.a].index, segs[m.b].index + segs[m.b].segment.length);
function sentenceOf(m: Mark) {
	const at = segs[m.a].index;
	return (sentences.find((x) => at >= x.index && at < x.index + x.segment.length)?.segment ?? "").trim();
}
const keyOf = (m: Mark) => `${block}:${m.n}`;
const stateOf = (m: Mark) => collector.kept.find((k) => k.key === keyOf(m));

function addRange(a: number, b: number) {
	[a, b] = [Math.min(a, b), Math.max(a, b)];
	const before = prevWord(a);
	const after = nextWord(b) < 0 ? Number.POSITIVE_INFINITY : nextWord(b);
	const touching = marks.filter((m) => m.b >= before && m.a <= after);
	for (const m of touching) {
		a = Math.min(a, m.a);
		b = Math.max(b, m.b);
	}
	const keep = touching[0];
	for (const m of touching) if (m !== keep) collector.unmark(keyOf(m));
	marks = marks.filter((m) => !touching.includes(m) || m === keep);
	const m = keep ?? { n: nextN++, a, b };
	if (keep) Object.assign(keep, { a, b });
	else marks.push(m);
	const live = keep ?? marks[marks.length - 1];
	collector.mark(block, text, keyOf(live), textOf(live), sentenceOf(live));
}
let drag: { from: number; to: number; x: number; y: number; moved: boolean; touch: boolean } | null = null;
const wordIndex = (el: Element | null) => (el instanceof HTMLElement && el.classList.contains("w") ? Number(el.dataset.i) : null);
function down(e: PointerEvent) {
	const i = wordIndex(e.target as Element);
	if (i === null || e.button > 0) return;
	drag = { from: i, to: i, x: e.clientX, y: e.clientY, moved: false, touch: e.pointerType !== "mouse" };
	if (!drag.touch) e.preventDefault();
	(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
}
function move(e: PointerEvent) {
	if (!drag || drag.touch) return;
	const i = wordIndex(document.elementFromPoint(e.clientX, e.clientY));
	if (i === null || i === drag.to) return;
	drag.to = i;
	drag.moved = true;
	preview = [Math.min(drag.from, drag.to), Math.max(drag.from, drag.to)];
}
function up(e: PointerEvent) {
	if (!drag) return;
	const d = drag;
	drag = null;
	preview = null;
	if (d.touch && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 8) return;
	if (!d.moved) {
		const m = markAt(d.from);
		// Tapping a mark takes it back.
		if (m) {
			marks = marks.filter((x) => x !== m);
			collector.unmark(keyOf(m));
			return;
		}
		// Touch: the first tap waits for a neighbour to stretch to; a tap elsewhere starts again.
		if (d.touch) {
			if (pending === null) {
				pending = d.from;
				addRange(d.from, d.from);
				return;
			}
			const p = pending;
			pending = null;
			addRange(p, d.from);
			return;
		}
	}
	addRange(d.from, d.to);
}
const cls = (i: number) => {
	const s = segs[i];
	const m = markAt(i);
	const pv = preview && i >= preview[0] && i <= preview[1];
	const st = m ? stateOf(m) : undefined;
	return [
		s.isWordLike ? "w" : "",
		m ? "hl" : "",
		m && !st?.phrase && !st?.failed ? "filling" : "",
		m && i === m.a ? "first" : "",
		m && i === m.b ? "last" : "",
		pv ? "pv" : "",
	]
		.filter(Boolean)
		.join(" ");
};
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<p class="hl-text {className}" {lang} onpointerdown={down} onpointermove={move} onpointerup={up}>
	{#each segs as s, i}
		{@const c = cls(i)}
		{#if c}
			<span class={c} data-i={i}>{s.segment}</span>
		{:else}
			{s.segment}
		{/if}
	{/each}
</p>

<style>
.hl-text {
	margin: 0;
	white-space: pre-wrap;
	overflow-wrap: anywhere;
	user-select: none;
	-webkit-user-select: none;
	touch-action: manipulation;
}
.hl-text :global(.w) {
	cursor: text;
	border-radius: 3px;
	transition: background-color 0.12s;
}
.hl-text :global(.w:hover) {
	background: var(--hover);
}
.hl-text :global(.hl) {
	background: color-mix(in srgb, #f2c94c 45%, transparent);
	cursor: pointer;
	border-radius: 0;
}
:global([data-theme="dark"]) .hl-text :global(.hl) {
	background: color-mix(in srgb, #c9a227 38%, transparent);
}
/* Being filled in: the ink breathes until the notebook has it. */
.hl-text :global(.hl.filling) {
	animation: ink-breathe 1.4s ease-in-out infinite;
}
@keyframes ink-breathe {
	50% {
		background: color-mix(in srgb, #f2c94c 22%, transparent);
	}
}
.hl-text :global(.pv) {
	background: color-mix(in srgb, #f2c94c 30%, transparent);
}
.hl-text :global(.first) {
	border-start-start-radius: 4px;
	border-end-start-radius: 4px;
}
.hl-text :global(.last) {
	border-start-end-radius: 4px;
	border-end-end-radius: 4px;
}
@media (prefers-reduced-motion: reduce) {
	.hl-text :global(.hl.filling) {
		animation: none;
	}
}
</style>
