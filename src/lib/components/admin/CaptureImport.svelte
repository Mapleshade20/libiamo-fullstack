<script lang="ts">
import Check from "@lucide/svelte/icons/check";
import Copy from "@lucide/svelte/icons/copy";
import ModalDialog from "$lib/components/common/ModalDialog.svelte";
import Button from "$lib/components/ui/button/button.svelte";
import { toast } from "$lib/demo/app.svelte";
import { sourceStatus } from "$lib/demo/source";

/*
 * Importing a page capture into a scenario: the console script for the place (the same scripts learners use for
 * context, src/context/scripts.ts, from /api/capture-scripts), then the copy pasted here and checked the way the
 * composer checks it (lib/demo/source.ts). Choosing where the learner comes in and filling the fields from it is the
 * main app's (lib/admin/capture.ts) and comes with the merge; the demo keeps nothing.
 */
let { open = $bindable(false), site }: { open?: boolean; site: string } = $props();
const PLATFORMS = [
	{ key: "reddit", label: "Reddit", how: "On the post. Or open the post's address with .json at the end and copy the whole page." },
	{ key: "ao3", label: "AO3", how: "On the chapter whose comments you want (a one-shot's work page is its only chapter)." },
	{ key: "discord", label: "Discord", how: "In the channel, after scrolling up until the history you want is loaded." },
];
const here = $derived(PLATFORMS.find((p) => p.label === site)?.key);
const scripts = fetch("/api/capture-scripts").then((r) => r.json() as Promise<Record<string, string>>);
let copied = $state<string | null>(null);
let pasted = $state("");
const EN: Record<string, string> = {
	srcFound: "{what}: {n} messages, {w} words.",
	srcText: "Plain text, {w} words: not a capture. Copy it with a script.",
	srcBroken: "This does not read as a capture any more: copy it again with the script.",
};
const en = (key: string, vars: Record<string, string | number> = {}) => (EN[key] ?? key).replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
const status = $derived(sourceStatus(pasted, en));
async function copyScript(k: string) {
	await navigator.clipboard?.writeText((await scripts)[k]).catch(() => {});
	// The button says so: a toast would sit under the dialog's backdrop.
	copied = k;
}
function done() {
	open = false;
	pasted = "";
	copied = null;
	toast("Capture kept. Choosing the opening and filling the fields come with the merge.");
}
</script>

<ModalDialog bind:open labelledby="cap-h" wide>
	<h2 id="cap-h" class="mb-2">Import a capture</h2>
	<p class="p">On the page, open the console (F12), paste the script and press Enter: the capture is copied. Paste it below.</p>
	<ul class="plats">
		{#each PLATFORMS as p (p.key)}
			<li class:here={here === p.key}>
				<div class="pm"><span class="pl">{p.label}</span><span class="how">{p.how}</span></div>
				<Button variant="secondary" size="sm" onclick={() => copyScript(p.key)}
					>{#if copied === p.key}
						<Check aria-hidden="true" />Copied
					{:else}
						<Copy aria-hidden="true" />Copy script
					{/if}</Button
				>
			</li>
		{/each}
	</ul>
	<textarea
		class="adm-input cap"
		rows="5"
		spellcheck="false"
		bind:value={pasted}
		aria-label="Capture"
		aria-describedby="cap-status"
		placeholder="Paste the capture"
		data-initial-focus
	></textarea>
	<p
		class="status"
		id="cap-status"
		class:bad={status.kind === "broken" || status.kind === "text"}
		class:ok={status.kind === "capture"}
		aria-live="polite"
	>
		{status.line}
	</p>
	<div class="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
		<Button variant="secondary" onclick={() => (open = false)}>Cancel</Button>
		<Button disabled={status.kind !== "capture"} onclick={done}>Import</Button>
	</div>
</ModalDialog>

<style>
.p {
	margin: 0 0 14px;
	color: var(--muted);
	font-size: 14px;
}
.plats {
	display: grid;
	gap: 6px;
	margin: 0 0 14px;
	padding: 0;
	list-style: none;
}
.plats li {
	display: flex;
	align-items: center;
	gap: 12px;
	padding: 10px 10px 10px 12px;
	border-radius: 6px;
	background: var(--well);
}
.plats li.here {
	box-shadow: inset 0 0 0 1px var(--line);
}
.pm {
	display: flex;
	flex: 1;
	flex-direction: column;
	min-width: 0;
}
.pl {
	font-size: 14px;
	font-weight: 500;
}
.how {
	color: var(--muted);
	font-size: 12.5px;
	line-height: 1.45;
}
.cap {
	font:
		12px / 1.5 ui-monospace,
		SFMono-Regular,
		Menlo,
		monospace;
}
.status {
	min-height: 1.4em;
	margin: 6px 0 0;
	color: var(--muted);
	font-size: 13px;
}
.status.ok {
	color: var(--ok);
}
.status.bad {
	color: var(--bad);
}
@media (max-width: 480px) {
	.plats li {
		flex-direction: column;
		align-items: stretch;
	}
}
</style>
