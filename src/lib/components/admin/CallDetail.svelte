<script lang="ts">
import ArrowLeft from "@lucide/svelte/icons/arrow-left";
import Copy from "@lucide/svelte/icons/copy";
import { fmtClock, fmtCost, type RecordedCall } from "#lib/admin/records.ts";
import Accordion from "#lib/components/common/Accordion.svelte";
import { tip } from "#lib/components/common/tip.ts";
import { toast } from "#lib/components/shell/toast.svelte.ts";

/*
 * One model call of a session: what it was for, the model and effort, when it ran and what it cost, the messages it
 * sent (the system prompt folded) and what came back, as parsed JSON when it is JSON.
 */
let { call, onback }: { call: RecordedCall; onback?: () => void } = $props();
const json = (s: string) => {
	const m = s.match(/```json\s*([\s\S]*?)```/) ?? [null, s];
	try {
		return JSON.stringify(JSON.parse((m[1] ?? s).trim()), null, 2);
	} catch {
		return null;
	}
};
const pretty = $derived(json(call.output));
const ROLE: Record<string, string> = { system: "System prompt", user: "Message", assistant: "Earlier answer" };
async function copy(text: string) {
	await navigator.clipboard?.writeText(text).catch(() => {});
	toast("Copied");
}
</script>

<div class="cd">
	<header>
		{#if onback}
			<button type="button" class="adm-icon" aria-label="All calls" use:tip={"All calls"} onclick={onback}>
				<ArrowLeft class="size-4" aria-hidden="true" />
			</button>
		{/if}
		<div class="h">
			<h3>{call.purpose}</h3>
			<p class="ctag">{call.tag}</p>
		</div>
	</header>
	<div class="facts">
		<p>{call.model} · {call.effort} · started {fmtClock(call.at)}</p>
		<p>
			{(call.ms / 1000).toFixed(1)}
			s · {call.tokens.input.toLocaleString("en")} in / {call.tokens.output.toLocaleString("en")} out · {fmtCost(call.cost)}
		</p>
	</div>
	{#each call.messages as m, i (i)}
		<Accordion variant="plain" title={ROLE[m.role] ?? m.role} open={m.role !== "system"} class="msg">
			<div class="block">
				<button type="button" class="adm-icon cp" aria-label="Copy" use:tip={"Copy"} onclick={() => copy(m.content)}>
					<Copy class="size-3.5" aria-hidden="true" />
				</button>
				<pre class="prose">{m.content}</pre>
			</div>
		</Accordion>
	{/each}
	<Accordion variant="plain" title="Output" open class="msg">
		<div class="block">
			<button type="button" class="adm-icon cp" aria-label="Copy" use:tip={"Copy"} onclick={() => copy(call.output)}>
				<Copy class="size-3.5" aria-hidden="true" />
			</button>
			{#if pretty}
				<pre class="json">{pretty}</pre>
			{:else}
				<pre class="prose">{call.output}</pre>
			{/if}
		</div>
	</Accordion>
</div>

<style>
.cd {
	min-width: 0;
}
header {
	display: flex;
	align-items: flex-start;
	gap: 6px;
}
header .adm-icon {
	margin: -2px 0 0 -6px;
}
.h {
	min-width: 0;
}
h3 {
	margin: 0;
	font-size: 16px;
	font-weight: 600;
	line-height: 1.35;
}
.ctag {
	margin: 2px 0 0;
	color: var(--muted);
	font:
		12px / 1.4 ui-monospace,
		SFMono-Regular,
		Menlo,
		monospace;
}
.facts p {
	margin: 0;
}
.facts {
	margin: 10px 0 6px;
	padding-bottom: 12px;
	border-bottom: 1px solid var(--line-soft);
	color: var(--ink-2);
	font-size: 13px;
	font-variant-numeric: tabular-nums;
}
.cd :global(.msg) {
	border-bottom: 1px solid var(--line-soft);
}
.block {
	position: relative;
}
.cp {
	position: absolute;
	top: 4px;
	right: 4px;
	width: 28px;
	height: 28px;
	background: var(--raised);
}
pre {
	margin: 0;
	max-height: 26rem;
	overflow: auto;
	padding: 10px 40px 10px 12px;
	border-radius: 6px;
	background: var(--well);
	white-space: pre-wrap;
	overflow-wrap: anywhere;
}
.prose {
	font: 13px / 1.6 var(--font-sans-stack);
	color: var(--ink-2);
}
.json {
	font:
		12px / 1.55 ui-monospace,
		SFMono-Regular,
		Menlo,
		monospace;
	color: var(--ink-2);
}
</style>
