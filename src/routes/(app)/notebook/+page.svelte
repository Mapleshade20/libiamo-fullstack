<script lang="ts">
import { blur } from "svelte/transition";
import SegmentedControl from "#lib/components/common/SegmentedControl.svelte";
import EmptyState from "#lib/components/shell/EmptyState.svelte";
import Button from "#lib/components/ui/button/button.svelte";
import { app, tx } from "#lib/demo/app.svelte.ts";
import { reviewDeck } from "#lib/demo/data.ts";
import { type Note, notebook } from "#lib/demo/notes.ts";

/* The notebook: every phrase the learner keeps, whether it came out of their own writing (what they reworked in a
   session) or was collected from something they read. Review runs over all of it; each entry opens its own page. */
const notes = $derived<Note[]>(notebook());
let filter = $state("all");
const shown = $derived(notes.filter((n) => filter === "all" || n.from === filter));
const due = $derived(reviewDeck().length);
$effect(() => {
	document.title = `${tx("navNotebook")} · ${tx("homeTitle")}`;
});
</script>

<main class="sheet">
	<h1>{tx("navNotebook")}</h1>
	{#if due}
		<div class="due">
			<span class="n">{due}</span>
			<span class="grow">{tx("reviewDueShort")}</span>
			<Button href="/review">{tx("reviewGo")}</Button>
		</div>
	{/if}
	<div class="filters">
		<SegmentedControl
			label={tx("nbFilter")}
			bind:value={filter}
			items={[
				{ value: "all", label: tx("nbAll") },
				{ value: "own", label: tx("nbOwn") },
				{ value: "collected", label: tx("nbCollected") },
			]}
		/>
	</div>
	<!-- Filtering swaps the list in place through a short blur; the control's pill slides. -->
	<div class="list">
		{#key filter}
			<div class="layer" in:blur={{ duration: 220, delay: 90, amount: 2 }} out:blur={{ duration: 100, amount: 2 }}>
				{#if shown.length}
					<div class="rows">
						{#each shown as n (n.id)}
							<a class="row" href="/notebook/{n.id}">
								<div class="main">
									<div class="phrase" lang={app.lang}>{n.phrase}</div>
									{#if n.gloss}
										<p class="sub">{n.gloss}</p>
									{/if}
									<p class="sub">{tx(n.from === "own" ? "nbFromOwn" : "nbFromRead", { where: n.where })}</p>
								</div>
								{#if n.due}
									<span class="tag on">{tx("nbDue")}</span>
								{:else}
									<span class="tag">{n.next === 1 ? tx("nbTomorrow") : tx("nbNext", { n: n.next ?? 1 })}</span>
								{/if}
							</a>
						{/each}
					</div>
				{:else}
					<EmptyState
						art="cards"
						title={tx(filter === "collected" ? "nbEmptyReadTitle" : filter === "own" ? "nbEmptyOwnTitle" : "nbEmptyTitle")}
						body={tx(filter === "collected" ? "nbEmptyRead" : filter === "own" ? "nbEmptyOwn" : "nbEmpty")}
						action={{ label: tx(filter === "collected" ? "modeCollect" : "navNew"), href: "/" }}
					/>
				{/if}
			</div>
		{/key}
	</div>
</main>

<style>
.due {
	display: flex;
	align-items: center;
	gap: 14px;
	padding: 12px 12px 12px 18px;
	margin-bottom: 22px;
	border-radius: 6px;
	background: var(--card-bg);
	border: 1px solid var(--edge);
}
:global(html[data-vt="/notebook>/review"]) .due,
:global(html[data-vt="/review>/notebook"]) .due {
	view-transition-name: review;
}
.n {
	font-family: var(--font-serif-stack);
	font-size: 28px;
	line-height: 1;
}
.grow {
	flex: 1;
	color: var(--ink-2);
}
.filters {
	margin-bottom: 12px;
}
.list {
	display: grid;
}
.layer {
	grid-area: 1 / 1;
	min-width: 0;
}
.phrase {
	font-family: var(--font-serif-stack);
	font-size: 18px;
}
a.row {
	color: inherit;
	text-decoration: none;
	transition: background-color 150ms;
}
a.row:hover {
	background: var(--hover);
}
a.row:focus-visible {
	outline: 2px solid var(--ring-c);
	outline-offset: -2px;
}
</style>
