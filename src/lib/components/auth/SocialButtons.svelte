<script lang="ts">
import LoaderCircle from "@lucide/svelte/icons/loader-circle";
import { signInSetup } from "#lib/account/account.remote.ts";
import { continueWith } from "#lib/account/account.svelte.ts";
import { SOCIAL_PROVIDERS, type SocialProviderId } from "#lib/auth/social.ts";
import SocialProviderIcon from "#lib/components/common/SocialProviderIcon.svelte";
import Button from "#lib/components/ui/button/button.svelte";

/* Google and GitHub, under the address form: the same buttons sign in and sign up (a new account goes on to set up).
   Only the providers this deployment has credentials for; with none, not even the "or". */
let { tx }: { tx: (key: string, vars?: Record<string, string>) => string } = $props();
const offered = (await signInSetup()).providers;
const PROVIDERS = SOCIAL_PROVIDERS.filter((p) => offered.includes(p.id));
let pending = $state<string | null>(null);
async function go(id: SocialProviderId) {
	pending = id;
	await continueWith(id);
}
</script>

{#if PROVIDERS.length}
	<p class="or">{tx("auOr")}</p>
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
{/if}

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
