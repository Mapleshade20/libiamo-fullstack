<script lang="ts">
import LoaderCircle from "@lucide/svelte/icons/loader-circle";
import { SOCIAL_PROVIDERS, type SocialProviderId } from "$lib/auth/social";
import SocialProviderIcon from "$lib/components/auth/SocialProviderIcon.svelte";
import { Button } from "$lib/components/ui/button";

interface Props {
	providers: SocialProviderId[];
	pending?: SocialProviderId | null;
}

let { providers, pending = null }: Props = $props();
let availableProviders = $derived(SOCIAL_PROVIDERS.filter(({ id }) => providers.includes(id)));
</script>

{#if availableProviders.length > 0}
	<div class="space-y-3">
		{#each availableProviders as provider}
			<Button
				type="submit"
				name="provider"
				value={provider.id}
				formnovalidate
				variant="outline"
				class="relative min-h-11 w-full bg-background/80 shadow-sm hover:bg-muted/70"
				disabled={pending !== null}
				data-social-provider={provider.id}
			>
				<span class="absolute left-4 inline-flex size-5 items-center justify-center" aria-hidden="true">
					{#if pending === provider.id}
						<LoaderCircle class="size-4 animate-spin motion-reduce:animate-none" />
					{:else}
						<SocialProviderIcon provider={provider.id} />
					{/if}
				</span>
				{pending === provider.id ? `Opening ${provider.label}…` : `Continue with ${provider.label}`}
			</Button>
		{/each}
	</div>
{/if}
