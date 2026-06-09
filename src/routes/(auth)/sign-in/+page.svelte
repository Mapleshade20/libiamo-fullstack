<script lang="ts">
import Eye from "@lucide/svelte/icons/eye";
import EyeOff from "@lucide/svelte/icons/eye-off";
import { enhance } from "$app/forms";
import { handleInvalidField } from "$lib/client/form-attention";
import ActionNotification from "$lib/components/ActionNotification.svelte";
import FormErrorFocus from "$lib/components/FormErrorFocus.svelte";
import { Button } from "$lib/components/ui/button";
import * as Card from "$lib/components/ui/card";
import { Input } from "$lib/components/ui/input";
import { Label } from "$lib/components/ui/label";

let { form, data } = $props();
let showPassword = $state(false);
let signInForm: HTMLFormElement | null = $state(null);

const actionNotification = $derived(
	data.resetSuccess
		? { variant: "success" as const, title: "Password reset", message: "Password reset successfully. Please sign in." }
		: form?.message
			? { variant: "error" as const, title: "Unable to sign in", message: form.message }
			: null,
);
</script>

<svelte:head>
	<title>Sign In · Libiamo</title>
	<meta name="description" content="Sign in to continue your language practice with Libiamo.">
</svelte:head>

<Card.Root>
	<Card.Header><Card.Title class="text-xl">Sign In</Card.Title></Card.Header>
	<Card.Content>
		<ActionNotification notification={actionNotification} />
		<FormErrorFocus formRef={signInForm} errors={form?.errors} fieldOrder={["email", "password"]} />

		<form bind:this={signInForm} method="POST" use:enhance class="space-y-4" oninvalidcapture={handleInvalidField}>
			<div class="space-y-2">
				<Label for="email">Email</Label>
				<Input id="email" name="email" type="email" value={form?.values?.email ?? ""} required aria-invalid={Boolean(form?.errors?.email)} />
				{#if form?.errors?.email}
					<p class="text-sm text-red-600">{form.errors.email[0]}</p>
				{/if}
			</div>

			<div class="space-y-2">
				<Label for="password">Password</Label>
				<div class="relative">
					<Input id="password" name="password" type={showPassword ? "text" : "password"} required aria-invalid={Boolean(form?.errors?.password)} />
					<button
						type="button"
						class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
						aria-label={showPassword ? "Hide password" : "Show password"}
						aria-pressed={showPassword}
						onclick={() => (showPassword = !showPassword)}
					>
						{#if showPassword}
							<EyeOff size={18} />
						{:else}
							<Eye size={18} />
						{/if}
					</button>
				</div>
				{#if form?.errors?.password}
					<p class="text-sm text-red-600">{form.errors.password[0]}</p>
				{/if}
			</div>

			<Button type="submit" class="w-full">Sign In</Button>
		</form>
	</Card.Content>
	<Card.Footer class="flex flex-col gap-2 text-sm">
		<a href="/forgot-password" class="text-muted-foreground hover:underline">Forgot password?</a>
		<p class="text-muted-foreground">Don't have an account? <a href="/sign-up" class="font-medium text-foreground hover:underline">Sign Up</a></p>
	</Card.Footer>
</Card.Root>
