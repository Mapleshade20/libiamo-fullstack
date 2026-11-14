<script lang="ts">
import Bug from "@lucide/svelte/icons/bug";
import Check from "@lucide/svelte/icons/check";
import Lightbulb from "@lucide/svelte/icons/lightbulb";
import MessageCircle from "@lucide/svelte/icons/message-circle";
import { flip } from "svelte/animate";
import { fade, slide } from "svelte/transition";
import Accordion from "$lib/components/common/Accordion.svelte";
import SegmentedControl from "$lib/components/common/SegmentedControl.svelte";
import { tip } from "$lib/components/common/tip";
import Button from "$lib/components/ui/button/button.svelte";
import { FEEDBACK, fmtDay, langEn, SUGGESTIONS } from "$lib/demo/admin";
import { toast } from "$lib/demo/app.svelte";
import { scenarioById } from "$lib/demo/scenarios";

/*
 * What learners send: situations they suggest for scenarios (the shelf's "+" card) and feedback about the app (the
 * account menu). A suggestion becomes a draft scenario the admin rewrites (names changed, anything personal removed)
 * or is set aside with a reason the learner sees; feedback is marked done once read and acted on.
 */
let tab = $state("suggestions");
let sug = $state(structuredClone(SUGGESTIONS));
let fb = $state(structuredClone(FEEDBACK));
const pending = $derived(sug.filter((s) => s.status === "pending"));
const handled = $derived(sug.filter((s) => s.status !== "pending"));
const open = $derived(fb.filter((f) => !f.done));
const done = $derived(fb.filter((f) => f.done));
let declining = $state<number | null>(null);
let reason = $state("");
const KIND = {
	idea: { icon: Lightbulb, label: "Idea" },
	bug: { icon: Bug, label: "Something wrong" },
	other: { icon: MessageCircle, label: "Other" },
};
function use(id: number) {
	const s = sug.find((x) => x.id === id);
	if (s) s.status = "live";
	toast("A draft scenario was made from it (demo)");
}
function decline(id: number) {
	const s = sug.find((x) => x.id === id);
	if (s) Object.assign(s, { status: "unused", reason: reason.trim() });
	declining = null;
	reason = "";
}
</script>

<div class="adm-page">
	<header class="adm-head"><h1>Inbox</h1></header>
	<div class="adm-filters">
		<SegmentedControl
			label="Inbox"
			size="sm"
			bind:value={tab}
			items={[
				{ value: "suggestions", label: `Suggestions${pending.length ? ` ${pending.length}` : ""}` },
				{ value: "feedback", label: `Feedback${open.length ? ` ${open.length}` : ""}` },
			]}
		/>
	</div>

	{#if tab === "suggestions"}
		{#if pending.length}
			<ul class="cards">
				{#each pending as s (s.id)}
					<li class="adm-paper card" animate:flip={{ duration: 250 }} out:fade={{ duration: 150 }}>
						<div class="who">
							<span>{s.by}</span><span class="adm-dot">{s.place}</span><span class="adm-dot">{langEn(s.lang)}</span><span class="grow"></span
							><span class="adm-meta">{fmtDay(s.at)}</span>
						</div>
						<p class="sit" lang={s.lang}>{s.situation}</p>
						<dl>
							<dt>Wanted to</dt>
							<dd lang={s.lang}>{s.purpose}</dd>
							{#if s.mine}
								<dt>Wrote</dt>
								<dd class="mine" lang={s.lang}>{s.mine}</dd>
							{/if}
						</dl>
						{#if declining === s.id}
							<form
								class="why"
								transition:slide={{ duration: 200 }}
								onsubmit={(e) => {
									e.preventDefault();
									decline(s.id);
								}}
							>
								<input
									class="adm-input"
									bind:value={reason}
									placeholder="Why, in a line the learner will read"
									aria-label="Reason"
									data-initial-focus
								>
								<Button variant="secondary" onclick={() => (declining = null)}>Cancel</Button>
								<Button type="submit" disabled={!reason.trim()}>Set aside</Button>
							</form>
						{:else}
							<div class="acts">
								<Button
									variant="secondary"
									onclick={() => {
										declining = s.id;
										reason = "";
									}}
									>Set aside</Button
								>
								<Button onclick={() => use(s.id)}>Make a scenario</Button>
							</div>
						{/if}
					</li>
				{/each}
			</ul>
		{:else}
			<p class="adm-empty adm-paper">Nothing waiting.</p>
		{/if}
		{#if handled.length}
			<Accordion title="Handled ({handled.length})" class="later">
				<ul class="adm-rows">
					{#each handled as s (s.id)}
						<li class="adm-row small">
							<div class="main">
								<div class="t" lang={s.lang}>{s.situation}</div>
								<div class="s">
									{s.by}
									·
									{fmtDay(s.at)}
									{#if s.reason}
										{" · "}{s.reason}
									{/if}
								</div>
							</div>
							{#if s.status === "live"}
								{@const sc = s.scenario ? scenarioById(s.scenario) : undefined}
								{#if sc}
									<a class="adm-tag ok" href="/admin/scenarios/{sc.id}">Became “{sc.title.en}”</a>
								{:else}
									<span class="adm-tag ok">Draft made</span>
								{/if}
							{:else}
								<span class="adm-tag">Not used</span>
							{/if}
						</li>
					{/each}
				</ul>
			</Accordion>
		{/if}
	{:else}
		{#if open.length}
			<ul class="cards">
				{#each open as f (f.id)}
					{@const K = KIND[f.kind]}
					<li class="adm-paper card fb" animate:flip={{ duration: 250 }} out:fade={{ duration: 150 }}>
						<span class="kind" use:tip={K.label}><K.icon class="size-4" aria-hidden="true" /></span>
						<div class="main">
							<p class="text">{f.text}</p>
							<p class="adm-meta wrap">{f.by} · {f.page} · {f.browser} · {fmtDay(f.at)}</p>
						</div>
						<button type="button" class="adm-icon" aria-label="Done" use:tip={"Done"} onclick={() => (f.done = true)}>
							<Check class="size-4" aria-hidden="true" />
						</button>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="adm-empty adm-paper">Nothing waiting.</p>
		{/if}
		{#if done.length}
			<Accordion title="Done ({done.length})" class="later">
				<ul class="adm-rows">
					{#each done as f (f.id)}
						<li class="adm-row small">
							<div class="main">
								<div class="t">{f.text}</div>
								<div class="s">{f.by} · {fmtDay(f.at)}</div>
							</div>
							<button type="button" class="adm-icon" aria-label="Not done" use:tip={"Back to the inbox"} onclick={() => (f.done = false)}>
								<Check class="size-4" aria-hidden="true" />
							</button>
						</li>
					{/each}
				</ul>
			</Accordion>
		{/if}
	{/if}
</div>

<style>
.cards {
	display: grid;
	gap: 12px;
	margin: 0;
	padding: 0;
	list-style: none;
}
.card {
	padding: 16px 20px 18px;
}
.who {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	color: var(--muted);
	font-size: 13px;
}
.grow {
	flex: 1;
}
.sit {
	margin: 8px 0 10px;
	font-size: 15.5px;
	line-height: 1.6;
}
dl {
	display: grid;
	grid-template-columns: 6rem minmax(0, 1fr);
	gap: 4px 12px;
	margin: 0;
	font-size: 14px;
	line-height: 1.55;
}
dt {
	color: var(--muted);
}
dd {
	margin: 0;
}
.mine {
	font-style: italic;
	color: var(--ink-2);
}
@container (max-width: 520px) {
	dl {
		grid-template-columns: minmax(0, 1fr);
	}
	dd + dt {
		margin-top: 6px;
	}
}
.acts {
	display: flex;
	flex-wrap: wrap;
	justify-content: flex-end;
	gap: 8px;
	margin-top: 14px;
}
.why {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	margin-top: 14px;
}
.why .adm-input {
	flex: 1 1 16rem;
}
.fb {
	display: flex;
	align-items: flex-start;
	gap: 12px;
}
.kind {
	display: grid;
	flex: none;
	place-items: center;
	width: 32px;
	height: 32px;
	border-radius: 50%;
	background: var(--well);
	color: var(--ink-2);
}
.fb .main {
	flex: 1;
	min-width: 0;
}
.text {
	margin: 4px 0 6px;
	font-size: 15px;
	line-height: 1.55;
}
.wrap {
	white-space: normal;
}
:global(.later) {
	margin-top: 18px;
}
.small {
	min-height: 52px;
	padding: 10px 4px;
}
.small .t {
	font-size: 14px;
}
</style>
