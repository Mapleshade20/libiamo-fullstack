<script lang="ts">
import LoaderCircle from "@lucide/svelte/icons/loader-circle";
import SocialProviderIcon from "#lib/components/common/SocialProviderIcon.svelte";
import Button from "#lib/components/ui/button/button.svelte";
import { continueWith } from "#lib/demo/account.svelte.ts";

/* Google and GitHub, under the address form: the same buttons sign in and sign up (a new account goes on to set up). */
let { tx }: { tx: (key: string, vars?: Record<string, string>) => string } = $props();
const PROVIDERS = [
	{ id: "google", label: "Google" },
	{ id: "github", label: "GitHub" },
] as const;
let pending = $state<string | null>(null);
async function go(id: (typeof PROVIDERS)[number]["id"]) {
	pending = id;
	await continueWith(id);
	pending = null;
}
</script>

<div class="social">
	{#each PROVIDERS as p (p.id)}
		<Button variant="secondary" class="w-full" disabled={pending !== null} onclick={() => go(p.id)}>
			<span class="ic" aria-hidden="true">
				{#if pending === p.id}
					<LoaderCircle class="size-4 animate-spin motion-reduce:animate-none" />
				{:else}
					<SocialProviderIcon provider={p.id} />
				{/if}
			</span>
			{tx(pending === p.id ? "auOpening" : "auWith", { provider: p.label })}
		</Button>
	{/each}
</div>

<style>
.social {
	display: flex;
	flex-direction: column;
	gap: 10px;
}
.social :global(button) {
	position: relative;
}
.ic {
	position: absolute;
	inset-inline-start: 14px;
	display: inline-grid;
	place-items: center;
	width: 20px;
}
</style>
