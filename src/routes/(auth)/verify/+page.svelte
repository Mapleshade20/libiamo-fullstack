<script lang="ts">
import { Button } from "$lib/components/ui/button";
import * as Card from "$lib/components/ui/card";

let { data } = $props();
</script>

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
				<p class="text-red-600">Email verification failed.</p>
				<p class="text-muted-foreground">The link may have expired. Please sign in to receive a new verification email.</p>
				<Button href="/sign-in" variant="default">Sign In</Button>
			</div>
		{:else if data.success}
			<div class="space-y-3 text-center">
				<p class="text-green-700">Email verified!</p>
				<Button href="/" variant="default">Begin Your Journey</Button>
			</div>
		{:else}
			<p class="text-center text-muted-foreground"><a href="/sign-in" class="font-medium text-foreground hover:underline">Sign in</a> to continue.</p>
		{/if}
	</Card.Content>
</Card.Root>
