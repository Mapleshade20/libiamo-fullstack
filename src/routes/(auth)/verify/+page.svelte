<script lang="ts">
import ActionNotification from "$lib/components/ActionNotification.svelte";
import { Button } from "$lib/components/ui/button";
import * as Card from "$lib/components/ui/card";

let { data } = $props();

const actionNotification = $derived(
	data.error
		? {
				variant: "error" as const,
				title: "Verification failed",
				message: "The link may have expired. Please sign in to receive a new verification email.",
			}
		: data.success
			? { variant: "success" as const, title: "Email verified", message: "You're ready to begin your journey." }
			: null,
);
</script>

<ActionNotification notification={actionNotification} />

<Card.Root>
	<Card.Header> <Card.Title class="text-xl">Email Verification</Card.Title> </Card.Header>
	<Card.Content>
		{#if data.pending}
			<div class="space-y-3 text-center">
				<p class="text-muted-foreground">Check your email for a verification link.</p>
				<p class="text-sm text-muted-foreground">Once verified, you can close this page and return to the app.</p>
			</div>
		{:else if data.error}
			<div class="space-y-3 text-center">
				<p class="text-muted-foreground">The verification link may have expired.</p>
				<Button href="/sign-in" variant="default">Sign In</Button>
			</div>
		{:else if data.success}
			<div class="space-y-3 text-center">
				<p class="text-muted-foreground">Email verified.</p>
				<Button href="/" variant="default">Begin Your Journey</Button>
			</div>
		{:else}
			<p class="text-center text-muted-foreground"><a href="/sign-in" class="font-medium text-foreground hover:underline">Sign in</a> to continue.</p>
		{/if}
	</Card.Content>
</Card.Root>
