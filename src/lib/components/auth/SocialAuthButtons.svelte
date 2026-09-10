<script lang="ts">
import LoaderCircle from "@lucide/svelte/icons/loader-circle";
import { SOCIAL_PROVIDERS, type SocialProviderId } from "$lib/auth/social";
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
					{:else if provider.id === "google"}
						<svg class="size-4" viewBox="0 0 24 24" aria-hidden="true">
							<path
								fill="#4285f4"
								d="M21.6 12.23c0-.71-.06-1.4-.2-2.05H12v3.87h5.37a4.6 4.6 0 0 1-1.99 3.01v2.51h3.23c1.89-1.74 2.99-4.3 2.99-7.34"
							/>
							<path
								fill="#34a853"
								d="M12 22c2.7 0 4.96-.9 6.61-2.43l-3.23-2.51c-.9.6-2.04.95-3.38.95-2.6 0-4.81-1.76-5.6-4.13H3.07v2.59A10 10 0 0 0 12 22"
							/>
							<path fill="#fbbc05" d="M6.4 13.88A6 6 0 0 1 6.09 12c0-.65.11-1.29.31-1.88V7.53H3.07A10 10 0 0 0 2 12c0 1.61.39 3.13 1.07 4.47z" />
							<path
								fill="#ea4335"
								d="M12 5.99c1.47 0 2.79.51 3.82 1.49l2.87-2.87A9.64 9.64 0 0 0 12 2a10 10 0 0 0-8.93 5.53l3.33 2.59C7.19 7.75 9.4 5.99 12 5.99"
							/>
						</svg>
					{:else}
						<svg class="size-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
							<path
								d="M12 .3a12 12 0 0 0-3.79 23.38c.6.11.82-.26.82-.58v-2.24c-3.34.73-4.04-1.42-4.04-1.42-.55-1.39-1.33-1.76-1.33-1.76-1.09-.74.08-.73.08-.73 1.2.09 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.3 3.5.99.11-.78.42-1.31.76-1.61-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.11-3.18 0 0 1.01-.32 3.3 1.23A11.5 11.5 0 0 1 12 6.07c1.02 0 2.04.14 3 .4 2.29-1.55 3.3-1.23 3.3-1.23.65 1.66.24 2.88.12 3.18.77.84 1.23 1.91 1.23 3.22 0 4.61-2.81 5.62-5.48 5.92.43.37.81 1.1.81 2.22v3.32c0 .32.22.7.83.58A12 12 0 0 0 12 .3"
							/>
						</svg>
					{/if}
				</span>
				{pending === provider.id ? `Opening ${provider.label}…` : `Continue with ${provider.label}`}
			</Button>
		{/each}
	</div>
{/if}
