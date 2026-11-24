<script lang="ts">
import { spanRanges } from "#lib/review/faces.ts";
import { words } from "#lib/text/words.ts";

/*
 * A sentence's words as toggles: the learner taps those its review card blanks. Runs of tapped words are the span's
 * pieces, apart ones joined by "…" ("framed … as"), as the notes call marks them (lib/review/faces.ts); `at` is where the
 * first begins, so the same words earlier in the sentence are not taken for them.
 */
let { text, span = $bindable(), at = $bindable(), lang }: { text: string; span?: string; at?: number; lang: string } = $props();
// Each word with the text around it (what comes before the first, what follows each up to the next).
const ws = $derived(
	words(text).map((w, i, all) => ({
		...w,
		head: i ? "" : text.slice(0, w.from),
		text: text.slice(w.from, w.to),
		after: text.slice(w.to, all[i + 1]?.from ?? text.length),
	})),
);
const ranges = $derived(span ? (spanRanges(text, span, at) ?? []) : []);
const on = $derived(ws.map((w) => ranges.some(([a, b]) => w.from >= a && w.to <= b)));

function toggle(i: number) {
	const next = on.map((x, j) => (j === i ? !x : x));
	const pieces: string[] = [];
	let from = 0;
	at = undefined;
	ws.forEach((w, j) => {
		if (next[j] && !next[j - 1]) from = w.from;
		at ??= next[j] ? w.from : undefined;
		if (next[j] && !next[j + 1]) pieces.push(text.slice(from, w.to));
	});
	span = pieces.length ? pieces.join(" … ") : undefined;
}
</script>

<!-- Nothing between a word and the text around it: a line break there would be a space, and Chinese has none. -->
<p class="words" {lang}>
	{#each ws as w, i}
		{w.head}<button type="button" class:on={on[i]} aria-pressed={on[i]} onclick={() => toggle(i)}>{w.text}</button
		><span class:on={on[i] && on[i + 1]}>{w.after}</span>
	{/each}
</p>

<style>
.words {
	margin: 0;
	font: 17px / 1.9 var(--font-serif-stack);
}
/* Inline and unpadded, as words are: no line break or gap between a word and the stop after it. */
button {
	display: inline;
	padding: 1px 0;
	border-radius: 3px;
	font: inherit;
	color: inherit;
	transition: background-color 120ms;
}
button:hover {
	background: var(--hover);
}
/* The notebook's yellow; marked words run together as one highlight, the spaces between them included. */
.on {
	padding: 1px 0;
	border-radius: 0;
	background: color-mix(in srgb, #f2c94c 45%, transparent);
}
:global([data-theme="dark"]) .on {
	background: color-mix(in srgb, #c9a227 38%, transparent);
}
</style>
