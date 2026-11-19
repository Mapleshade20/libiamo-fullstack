<script lang="ts">
import { toast } from "#lib/components/shell/toast.svelte.ts";
import Button from "#lib/components/ui/button/button.svelte";
import { tx } from "#lib/i18n/tx.ts";

/*
 * The console scripts that copy a page as a capture (server/writing/capture-scripts.ts), for the composer's context and
 * a suggested situation. They are fetched on the first copy; a failed fetch is asked again on the next.
 */
let { id }: { id?: string } = $props();
const SITES = [
	["ao3", "AO3"],
	["reddit", "Reddit"],
	["discord", "Discord"],
] as const;
let scripts: Promise<Record<string, string>> | null = null;
async function copy(k: string) {
	scripts ??= fetch("/api/capture-scripts")
		.then((r) => (r.ok ? r.json() : Promise.reject(new Error(`capture scripts: ${r.status}`))))
		.catch((e) => {
			scripts = null;
			throw e;
		});
	await navigator.clipboard.writeText((await scripts)[k]);
	toast(tx("grabCopied"));
}
</script>

<div class="grab" {id}>
	<p>{tx("grabHow")}</p>
	<div class="buttons">
		{#each SITES as [k, site] (k)}
			<Button variant="secondary" size="sm" onclick={() => copy(k)}>{tx("grabCopy", { site })}</Button>
		{/each}
	</div>
</div>

<style>
.grab {
	margin: 0 0 8px;
	padding: 10px 12px;
	border-radius: 6px;
	background: var(--well);
	font-size: 13px;
	color: var(--ink-2);
}
.grab p {
	margin: 0 0 8px;
}
.buttons {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}
</style>
