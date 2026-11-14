<script lang="ts">
import Check from "@lucide/svelte/icons/check";
import Ellipsis from "@lucide/svelte/icons/ellipsis";
import RotateCcw from "@lucide/svelte/icons/rotate-ccw";
import Terminal from "@lucide/svelte/icons/terminal";
import X from "@lucide/svelte/icons/x";
import { flip } from "svelte/animate";
import { fade } from "svelte/transition";
import FloatingPanel from "$lib/components/common/FloatingPanel.svelte";
import SegmentedControl from "$lib/components/common/SegmentedControl.svelte";
import { tip } from "$lib/components/common/tip";
import { CASES, type CaseRow, fmtDay, sessionById } from "$lib/demo/admin";
import { toast } from "$lib/demo/app.svelte";

/*
 * Cases: steps flagged in sessions, with what is wrong. They are the regression set: Claude Code pulls a case (read only
 * from production), replays it locally with the learner's own actions, fixes it, and replays every open and fixed
 * case before the commit that is recorded here. A flagged session keeps its calls until its case is closed.
 */
let list = $state<CaseRow[]>(structuredClone(CASES));
let tab = $state("open");
let menu = $state<number | null>(null);
const count = (s: CaseRow["status"]) => list.filter((c) => c.status === s).length;
const shown = $derived(list.filter((c) => c.status === tab));
async function copy(text: string) {
	await navigator.clipboard?.writeText(text).catch(() => {});
	toast(`Copied: ${text}`);
}
function set(c: CaseRow, status: CaseRow["status"]) {
	menu = null;
	c.status = status;
	if (status === "fixed") c.commit = "(next commit)";
}
</script>

<div class="adm-page">
	<header class="adm-head">
		<h1>Cases</h1>
		<div class="acts">
			<button type="button" class="cmd" use:tip={"Replay every open and fixed case"} onclick={() => copy("pnpm case replay --all")}>
				<Terminal class="size-4" aria-hidden="true" /><code>pnpm case replay --all</code>
			</button>
		</div>
	</header>
	<div class="adm-filters">
		<SegmentedControl
			label="State"
			size="sm"
			bind:value={tab}
			items={[
				{ value: "open", label: `Open ${count("open")}` },
				{ value: "fixed", label: `Fixed ${count("fixed")}` },
				{ value: "wontfix", label: `Won't fix ${count("wontfix")}` },
			]}
		/>
	</div>
	<div class="adm-paper">
		{#if shown.length}
			<ul class="adm-rows">
				{#each shown as c (c.id)}
					{@const s = sessionById(c.session)}
					<li class="case" animate:flip={{ duration: 250 }} in:fade={{ duration: 150 }}>
						<span class="num">{c.id}</span>
						<div class="main">
							<p class="note">{c.note}</p>
							<p class="s">
								<a href="/admin/sessions/{c.session}#step-{c.step}">{s?.title ?? `Session ${c.session}`}</a><span class="adm-dot">{c.stepLabel}</span
								><span class="adm-dot">{c.by}, {fmtDay(c.at)}</span>
								{#if c.commit}
									<span class="adm-dot"><span class="adm-tag ok mono">{c.commit}</span></span>
								{/if}
							</p>
						</div>
						<button
							type="button"
							class="adm-icon"
							aria-label="Copy pull command"
							use:tip={`pnpm case pull ${c.session}`}
							onclick={() => copy(`pnpm case pull ${c.session}`)}
						>
							<Terminal class="size-4" aria-hidden="true" />
						</button>
						<FloatingPanel
							open={menu === c.id}
							onOpenChange={(o) => (menu = o ? c.id : null)}
							label="Case {c.id}"
							align="end"
							role="menu"
							plainTrigger
							triggerClass="adm-icon"
							class="w-48"
						>
							{#snippet trigger()}
								<Ellipsis class="size-4" aria-hidden="true" />
							{/snippet}
							{#if c.status !== "fixed"}
								<button type="button" class="floating-menu-item" onclick={() => set(c, "fixed")}>
									<Check class="size-4 text-muted-foreground" aria-hidden="true" />Mark fixed
								</button>
							{/if}
							{#if c.status !== "wontfix"}
								<button type="button" class="floating-menu-item" onclick={() => set(c, "wontfix")}>
									<X class="size-4 text-muted-foreground" aria-hidden="true" />Won't fix
								</button>
							{/if}
							{#if c.status !== "open"}
								<button type="button" class="floating-menu-item" onclick={() => set(c, "open")}>
									<RotateCcw class="size-4 text-muted-foreground" aria-hidden="true" />Reopen
								</button>
							{/if}
						</FloatingPanel>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="adm-empty">{tab === "open" ? "No open case." : "None."}</p>
		{/if}
	</div>
</div>

<style>
.cmd {
	display: inline-flex;
	align-items: center;
	gap: 8px;
	height: 36px;
	padding: 0 12px;
	border: 1px solid var(--edge);
	border-radius: 6px;
	background: var(--well);
	color: var(--ink-2);
	cursor: pointer;
	transition:
		background-color 150ms,
		scale 150ms;
}
@media (pointer: coarse) {
	.cmd {
		height: 44px;
	}
}
.cmd:hover {
	background: var(--hover);
}
.cmd:active {
	scale: 0.97;
}
.cmd:focus-visible {
	outline: none;
	box-shadow: 0 0 0 3px color-mix(in oklab, var(--ring-c) 60%, transparent);
}
code,
.mono {
	font:
		12.5px ui-monospace,
		SFMono-Regular,
		Menlo,
		monospace;
}
.case {
	display: flex;
	align-items: flex-start;
	gap: 12px;
	padding: 14px 12px 14px 16px;
}
.num {
	flex: none;
	min-width: 1.6rem;
	padding-top: 1px;
	color: var(--muted);
	font:
		13px / 22px ui-monospace,
		SFMono-Regular,
		Menlo,
		monospace;
}
.main {
	flex: 1;
	min-width: 0;
}
.note {
	margin: 0;
	font-size: 15px;
	line-height: 1.55;
}
.s {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	margin: 4px 0 0;
	color: var(--muted);
	font-size: 13px;
}
.s a {
	color: var(--ink-2);
	text-decoration: underline;
	text-decoration-color: var(--line);
	text-underline-offset: 3px;
}
.s a:hover {
	text-decoration-color: var(--ink);
}
</style>
