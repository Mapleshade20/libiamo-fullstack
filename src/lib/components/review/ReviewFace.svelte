<script lang="ts">
import type { Snippet } from "svelte";
import { tx } from "#lib/demo/app.svelte.ts";
import { around, type Face } from "#lib/review/faces.ts";

/*
 * The front of a review card (lib/review/faces.ts), for review itself and for the notebook's preview: the cue (what
 * the learner first wrote, struck, or what it means), then the sentence with the phrase blanked, one blank per word
 * about as long as the word. Review passes `asked` to fill the blank with the answer once the card turns.
 */
let { face, lang, asked }: { face: Face; lang: string; asked?: Snippet } = $props();
const parts = $derived(around(face.text, face.answer));
const words = $derived(face.answer.split(/\s+/));
</script>

{#if face.was}
	<p class="was" {lang}><span class="sr-only">{tx("noteWas")}: </span><s>{face.was}</s></p>
{:else if face.cue}
	<p class="cue">{face.cue}</p>
{/if}
<p class="sentence" {lang}>
	{#if !parts}
		{face.text}
	{:else}
		{parts.before}
		{#if asked}
			{@render asked()}
		{:else}
			<span role="img" aria-label={tx("rvGapLabel", { n: words.length })}
				>{#each words as w, i}
					{i ? " " : ""}<span class="gap" style:--w={Math.max(2, w.length)}></span>
				{/each}</span
			>
		{/if}
		{parts.after}
	{/if}
</p>

<style>
.was,
.cue {
	margin: 0 0 10px;
	color: var(--muted);
	font: 15px / 1.5 var(--font-sans-stack);
}
.was {
	font-family: var(--font-serif-stack);
	font-size: 16px;
}
.was s {
	text-decoration-color: color-mix(in srgb, var(--bad) 60%, transparent);
}
.sentence {
	margin: 0;
	font: 21px / 1.6 var(--font-serif-stack);
	color: var(--ink);
}
/* One blank per missing word, each about as long as its word, so the learner knows how much to write. */
.gap {
	display: inline-block;
	width: calc(var(--w) * 0.62em + 0.6em);
	height: 1em;
	margin: 0 0.12em;
	vertical-align: -0.12em;
	border-bottom: 2px solid color-mix(in srgb, var(--ink) 40%, transparent);
}
</style>
