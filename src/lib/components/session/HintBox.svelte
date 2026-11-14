<script lang="ts">
import { reducedMotion } from "#lib/components/common/motion.ts";
import type { Hint } from "#lib/session/session.svelte.ts";

/*
 * A spot's pieces (words the learner already used, solid; words to bring in, dashed) and, once asked for, the second
 * hint: a sentence on another topic built the same way, its shared frame marked. A piece opens what it means here,
 * with an example from somewhere else, one at a time: picking another swaps the text while the box moves from the
 * height it has (even mid-move) to the one the new text needs, so quick clicks never stack notes or jump. The notes
 * are asked for on the first click (most learners never open one); one that arrives after another piece was picked
 * is dropped.
 */
let { hint, ongrow }: { hint: Hint; ongrow: (el: Element) => void } = $props();
let root: HTMLDivElement | undefined = $state();
let open = $state<number | null>(null);
let loading = $state(false);
let note = $state<{ text: string; gloss: string; example?: string } | null>(null);
let shell: HTMLDivElement | undefined = $state();
let body: HTMLDivElement | undefined = $state();
let move: Animation | null = null;

async function resize(fn: () => void) {
	const from = shell?.getBoundingClientRect().height ?? 0;
	fn();
	await Promise.resolve();
	requestAnimationFrame(() => {
		if (!shell || !body) return;
		// The note's own top margin is inside the shell too, or its last line is cut off.
		const to = open == null ? 0 : body.offsetHeight + Number.parseFloat(getComputedStyle(body).marginTop);
		const now = shell.getBoundingClientRect().height;
		move?.cancel();
		shell.style.height = `${to}px`;
		// Scrolled while the layout already has the height it is moving to (the move below only paints the way there).
		if (to > now && root) ongrow(root);
		if (reducedMotion() || Math.abs(to - from) < 1) return;
		move = shell.animate([{ height: `${from}px` }, { height: `${to}px` }], {
			duration: to > from ? 250 : 150,
			easing: "cubic-bezier(0.22, 1, 0.36, 1)",
		});
		if (!reducedMotion() && open != null) body?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, easing: "ease-out" });
	});
}
async function pick(i: number) {
	if (open === i)
		return resize(() => {
			open = null;
			note = null;
		});
	resize(() => {
		open = i;
		loading = true;
		note = null;
	});
	const notes = await hint.load();
	if (open !== i) return;
	const n = notes[i];
	if (n?.gloss)
		resize(() => {
			loading = false;
			note = { text: hint.pieces[i].text, gloss: n.gloss as string, example: n.example };
		});
	else
		resize(() => {
			open = null;
			loading = false;
		});
}
</script>

<div class="hintbox" bind:this={root}>
	<div class="chips">
		{#each hint.pieces as p, i}
			<button type="button" class="chip" class:new={!p.own} aria-expanded={open === i} onclick={() => pick(i)}>
				{#each p.text.split("/") as s}
					<span>{s.trim()}</span>
				{/each}
			</button>
		{/each}
	</div>
	<div class="chip-shell" bind:this={shell}>
		<div class="chip-note" bind:this={body} aria-live="polite">
			{#if note}
				<b>{note.text}</b>　{note.gloss}
				{#if note.example}
					<div class="ex">{note.example}</div>
				{/if}
			{:else if loading}
				<span class="wait-dots"><i></i><i></i><i></i></span>
			{/if}
		</div>
	</div>
	{#if hint.rung}
		{#if hint.rung.lead}
			<div class="rung-lead">{hint.rung.lead}</div>
		{/if}
		<!-- Built by #lib/session/text.ts from escaped words only. -->
		<div class="rung">{@html hint.rung.html}</div>
	{/if}
</div>

<style>
.chips {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	margin-top: 8px;
}
.chip {
	display: inline-flex;
	align-items: stretch;
	padding: 0;
	border-radius: 6px;
	border: 1.5px solid var(--line);
	background: var(--raised);
	color: inherit;
	font: inherit;
	font-size: 15px;
	line-height: 1.45;
	overflow: hidden;
	cursor: pointer;
	transition:
		border-color 0.15s ease,
		background-color 0.15s ease;
}
.chip.new {
	border-style: dashed;
	background: transparent;
}
.chip span {
	padding: 3px 10px;
}
.chip span + span {
	border-left: 1px solid var(--line);
}
.chip:hover,
.chip[aria-expanded="true"] {
	border-color: color-mix(in srgb, var(--ink) 45%, transparent);
}
.chip-shell {
	display: flow-root;
	overflow: hidden;
	height: 0;
}
.chip-note {
	margin-top: 8px;
	padding: 8px 12px;
	border-radius: 6px;
	background: var(--well);
	font-size: 14px;
	line-height: 1.55;
}
.chip-note b {
	font-family: var(--font-serif-stack);
	font-size: 15.5px;
}
.chip-note .ex {
	margin-top: 3px;
	color: var(--muted);
	font-style: italic;
}
.rung-lead {
	margin-top: 8px;
}
.rung {
	margin-top: 6px;
	padding: 8px 12px;
	border-radius: 6px;
	background: var(--well);
	font-family: var(--font-serif-stack);
	font-size: 16px;
	line-height: 1.7;
}
/* The frame the example shares with what the learner is building: theirs to borrow. */
.rung :global(.kw) {
	border-bottom: 1.5px solid color-mix(in srgb, var(--accent-c) 70%, transparent);
}
</style>
