<script lang="ts">
import type { Snippet } from "svelte";
import { tx } from "#lib/i18n/tx.ts";
import { around, type Face } from "#lib/review/faces.ts";

/*
 * The front of a review card (lib/review/faces.ts), for review itself and for the notebook's preview: the cue (what
 * the learner first wrote, struck, or what it means), then the sentence with the phrase blanked, one blank per word
 * about as long as the word. A phrase in pieces ("framed … as") is one blank, written whole, with the words between its
 * pieces hung under it. Review passes `asked` to fill the blank with the answer once the card turns.
 */
let { face, lang, asked }: { face: Face; lang: string; asked?: Snippet } = $props();
const parts = $derived(around(face.text, face.answer, face.at === undefined ? undefined : [face.at]));
const words = $derived(face.given ? [face.answer] : face.answer.split(/\s+/));
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
			<span
				class="blank"
				role="img"
				aria-label={[tx("rvGapLabel", { n: face.answer.split(/\s+/).length }), face.given && tx("rvGiven", { words: face.given.join(" … ") })]
					.filter(Boolean)
					.join(", ")}
				>{#each words as w, i}
					{i ? " " : ""}<span class="gap" style:--w={Math.max(2, w.length)}></span>
				{/each}
				{#if face.given}
					<span class="given" aria-hidden="true">{face.given.join(" … ")}</span>
				{/if}</span
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
/* The words given inside a blank in pieces hang under it, small, and the line makes room for them. */
.blank:has(.given) {
	position: relative;
	display: inline-block;
	padding-bottom: 1.1em;
}
/* Hung from the blank by a thin hook, the way a note in a margin points at its line. */
.given {
	position: absolute;
	left: 0.5em;
	bottom: 0;
	padding-left: 13px;
	white-space: nowrap;
	font: 14px / 1.2 var(--font-serif-stack);
	color: var(--muted);
}
.given::before {
	content: "";
	position: absolute;
	left: 0;
	top: -0.4em;
	width: 8px;
	height: 1.05em;
	border-left: 1px solid currentColor;
	border-bottom: 1px solid currentColor;
	border-bottom-left-radius: 5px;
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
