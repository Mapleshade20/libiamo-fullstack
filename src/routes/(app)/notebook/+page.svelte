<script lang="ts">
import { blur } from "svelte/transition";
import { app } from "#lib/account/app.svelte.ts";
import { revalidate } from "#lib/client/refresh.ts";
import SegmentedControl from "#lib/components/common/SegmentedControl.svelte";
import EmptyState from "#lib/components/shell/EmptyState.svelte";
import Button from "#lib/components/ui/button/button.svelte";
import { tx } from "#lib/i18n/tx.ts";
import { dueNow, lang, notebookNow } from "#lib/notebook/notebook.svelte.ts";
import type { NoteFrom, NoteRow } from "#lib/notebook/types.ts";

/* The notebook: every phrase the learner keeps, whether it came out of their own writing (what they reworked in a
   session) or was collected from something they read. Review runs over all of it; each entry opens its own page.
   The list comes a page at a time (server/notebook/notes.ts `notebookPage`), filtered on the server; the next page is
   asked for as the end of the list comes near. Most learners have one page. */
let filter = $state<NoteFrom>("all");
// The list opens unfiltered.
revalidate(notebookNow("all"), dueNow());
// Asked for together: a `$derived(await …)` is not begun until the one before it has its answer, and a query is not
// asked for until it is awaited (await_waterfall).
const [first, dueSummary] = $derived(await Promise.all([notebookNow(filter), dueNow()]));
const key = $derived(`${lang()}|${filter}`);
// The pages after the first, for the list as it is now filtered.
let more = $state<{ key: string; rows: NoteRow[]; next?: string }>({ key: "", rows: [] });
const later = $derived(more.key === key ? more : { key, rows: [] as NoteRow[], next: first.next });
const shown = $derived.by(() => {
	// The first page asked again (an entry changed) may now hold rows a later page brought.
	const seen = new Set(first.rows.map((n) => n.id));
	return [...first.rows, ...later.rows.filter((n) => !seen.has(n.id))];
});
let asking = false;
async function askMore() {
	const after = later.next;
	if (asking || !after) return;
	asking = true;
	const at = key;
	try {
		const page = await notebookNow(filter, after);
		if (at === key) more = { key: at, rows: [...later.rows, ...page.rows], next: page.next };
	} catch (e) {
		console.error("the notebook's next page was not loaded", e);
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
const due = $derived(dueSummary.count);
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
									<p class="sub">{tx(n.from === "own" ? "nbFromOwn" : "nbFromRead", { where: n.where || tx("nbSomethingRead") })}</p>
								</div>
								{#if n.due}
									<span class="tag on">{tx("nbDue")}</span>
								{:else}
									<span class="tag">{n.next === 1 ? tx("nbTomorrow") : tx("nbNext", { n: n.next ?? 1 })}</span>
								{/if}
							</a>
						{/each}
					</div>
					{#if later.next}
						<div class="more" use:nearing aria-hidden="true"></div>
					{/if}
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
.more {
	height: 1px;
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
