<script lang="ts">
import EmptyState from "#lib/components/shell/EmptyState.svelte";
import { tx } from "#lib/demo/app.svelte.ts";
import { myWriting, whenOf } from "#lib/demo/data.ts";
import { openPiece } from "#lib/demo/reopen.ts";

/* Everything the learner has brought here to write, newest first: what is still open, what they revised, and what they
   told us they posted. Opening one goes back into its session (the main app's archive and the sidebar's recents). */
const STATE = { open: "scenarioActive", revised: "wrRevised", posted: "wrPosted" } as const;
const list = $derived(myWriting());
$effect(() => {
	document.title = `${tx("navWriting")} · ${tx("homeTitle")}`;
});
</script>

<main class="sheet">
	<h1>{tx("navWriting")}</h1>
	{#if list.length}
		<div class="rows">
			{#each list as w (w.id)}
				<a
					class="row"
					id={w.id}
					href="/w/{w.id}"
					onclick={(e) => {
						e.preventDefault();
						openPiece(w);
					}}
				>
					<div class="main">
						<div class="title">{w.title}</div>
						<p class="sub">{w.site} · {whenOf(w)}</p>
					</div>
					<span class="tag" class:on={w.open}>{tx(STATE[w.open ? "open" : (w.state ?? "revised")])}</span>
				</a>
			{/each}
		</div>
	{:else}
		<EmptyState art="box" title={tx("wrEmptyTitle")} body={tx("wrEmpty")} action={{ label: tx("navNew"), href: "/" }} />
	{/if}
</main>

<style>
.row {
	border-radius: 6px;
	color: inherit;
	text-decoration: none;
	transition: background-color 150ms;
}
.row:hover {
	background: var(--hover);
}
.row:target {
	background: var(--well);
}
.row:focus-visible {
	outline: none;
	box-shadow: 0 0 0 3px color-mix(in oklab, var(--ring-c) 60%, transparent);
}
</style>
