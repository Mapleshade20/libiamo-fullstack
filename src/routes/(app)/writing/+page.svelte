<script lang="ts">
import { app } from "#lib/account/app.svelte.ts";
import EmptyState from "#lib/components/shell/EmptyState.svelte";
import { tx } from "#lib/i18n/tx.ts";
import { openPiece } from "#lib/writing/open.ts";
import type { PieceItem } from "#lib/writing/types.ts";
import { piecesPageNow, whenOf } from "#lib/writing/writing.svelte.ts";

/* Everything the learner has brought here to write, newest first: what is still open, what they revised, and what they
   told us they posted. Opening one goes back into its session (the main app's archive and the sidebar's recents). It
   comes a page at a time (server/writing/pieces.ts `piecesPage`); the next is asked for as the end comes near. */
const STATE = { open: "scenarioActive", revised: "wrRevised", posted: "wrPosted", abandoned: "wrAbandoned" } as const;
const first = $derived(await piecesPageNow());
// The pages after the first, for the language being worked in.
let more = $state<{ lang: string; items: PieceItem[]; next?: string }>({ lang: "", items: [] });
const later = $derived(more.lang === app.lang ? more : { lang: app.lang, items: [] as PieceItem[], next: first.next });
const list = $derived.by(() => {
	const seen = new Set(first.items.map((w) => w.id));
	return [...first.items, ...later.items.filter((w) => !seen.has(w.id))];
});
let asking = false;
async function askMore() {
	const after = later.next;
	if (asking || !after) return;
	asking = true;
	const lang = app.lang;
	try {
		const page = await piecesPageNow(after);
		if (lang === app.lang) more = { lang, items: [...later.items, ...page.items], next: page.next };
	} catch (e) {
		console.error("the next page of pieces was not loaded", e);
	} finally {
		asking = false;
	}
}
/** Asks for the next page while the end of the list is still a little way off. */
function nearing(node: HTMLElement) {
	const seen = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && askMore(), { rootMargin: "600px" });
	seen.observe(node);
	return { destroy: () => seen.disconnect() };
}
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
						<!-- A piece whose scene has not come yet has no place to name. -->
						<p class="sub">{[w.site, whenOf(w)].filter(Boolean).join(" · ")}</p>
					</div>
					<span class="tag" class:on={w.open}>{tx(STATE[w.open ? "open" : w.phase === "abandoned" ? "abandoned" : (w.state ?? "revised")])}</span>
				</a>
			{/each}
		</div>
		{#if later.next}
			<div class="more" use:nearing aria-hidden="true"></div>
		{/if}
	{:else}
		<EmptyState art="box" title={tx("wrEmptyTitle")} body={tx("wrEmpty")} action={{ label: tx("navNew"), href: "/" }} />
	{/if}
</main>

<style>
.more {
	height: 1px;
}
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
