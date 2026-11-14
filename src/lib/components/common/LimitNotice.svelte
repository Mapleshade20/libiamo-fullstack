<script lang="ts">
import Notice from "#lib/components/common/Notice.svelte";
import Button from "#lib/components/ui/button/button.svelte";
import type { Stop } from "#lib/demo/limits.ts";

/*
 * Why a step did not happen, said where the step was (under the box, in the post, in the conversation), never as a
 * toast. A failed call is offered again; no key, or a key the provider turned down, points to the settings' key (and
 * a refused one can be tried again once it is fixed). Nothing written is lost either way, and the copy says so.
 */
let { kind, tx, onretry }: { kind: Stop; tx: (k: string, v?: Record<string, string | number>) => string; lang?: string; onretry?: () => void } =
	$props();
const T = {
	error: ["failTitle", "failBody"],
	nokey: ["limitNoKeyTitle", "limitNoKeyBody"],
	refused: ["limitRefusedTitle", "limitRefusedBody"],
} as const;
</script>

<Notice tone={kind === "error" ? "danger" : "warning"} title={tx(T[kind][0])} role="alert">
	<p class="m-0">{tx(T[kind][1])}</p>
	{#if kind !== "error" || onretry}
		<div class="mt-2.5 flex flex-wrap gap-1.5">
			{#if kind !== "error"}
				<Button size="sm" href="/settings#set-ai">{tx(kind === "nokey" ? "limitAddKey" : "limitCheckKey")}</Button>
			{/if}
			{#if onretry && kind !== "nokey"}
				<Button size="sm" variant={kind === "error" ? "default" : "ghost"} onclick={onretry}>{tx("tryAgain")}</Button>
			{/if}
		</div>
	{/if}
</Notice>
