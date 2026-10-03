<script lang="ts">
import Eye from "@lucide/svelte/icons/eye";
import EyeOff from "@lucide/svelte/icons/eye-off";
import { enhance } from "$app/forms";
import { base } from "$app/paths";
import { isSocialProviderId, type SocialProviderId } from "$lib/auth/social";
import { handleInvalidField } from "$lib/client/form-attention";
import SocialAuthButtons from "$lib/components/auth/SocialAuthButtons.svelte";
import Turnstile from "$lib/components/auth/Turnstile.svelte";
import ActionNotification from "$lib/components/common/ActionNotification.svelte";
import FormErrorFocus from "$lib/components/common/FormErrorFocus.svelte";
import { Button } from "$lib/components/ui/button";
import * as Card from "$lib/components/ui/card";
import { Input } from "$lib/components/ui/input";
import { Label } from "$lib/components/ui/label";

let { form, data } = $props();
let showPassword = $state(false);
let signInForm: HTMLFormElement | null = $state(null);
let socialPending = $state<SocialProviderId | null>(null);

const actionNotification = $derived(
	data.resetSuccess
		? { variant: "success" as const, title: "Password reset", message: "Password reset successfully. Please sign in." }
		: form?.message
			? { variant: "error" as const, title: "Unable to sign in", message: form.message }
			: data.socialAuthError
				? { variant: "error" as const, title: "Unable to sign in", message: data.socialAuthError }
				: null,
);
</script>

<svelte:head>
	<title>Sign In · Libiamo</title>
	<meta name="description" content="Sign in to continue your language practice with Libiamo.">
</svelte:head>

<Card.Root>
	<Card.Header><Card.Title>Sign in</Card.Title></Card.Header>
	<Card.Content>
		<ActionNotification notification={actionNotification} />
		<FormErrorFocus formRef={signInForm} errors={form?.errors} fieldOrder={["email", "password"]} />

		<form
			bind:this={signInForm}
			method="POST"
			use:enhance={({ submitter }) => {
				const provider = submitter?.dataset.socialProvider;
				if (isSocialProviderId(provider)) socialPending = provider;
				return async ({ update }) => {
					await update({ reset: false });
					socialPending = null;
				};
			}}
			class="space-y-4"
			oninvalidcapture={handleInvalidField}
		>
			<div class="space-y-2">
				<Label for="email">Email</Label>
				<Input id="email" name="email" type="email" value={form?.values?.email ?? ""} required aria-invalid={Boolean(form?.errors?.email)} />
				{#if form?.errors?.email}
					<p data-field-error="email" class="field-error-message">{form.errors.email[0]}</p>
				{/if}
			</div>

			<div class="space-y-2">
				<Label for="password">Password</Label>
				<div class="relative">
					<Input
						id="password"
						name="password"
						type={showPassword ? "text" : "password"}
						class="pr-11"
						required
						aria-invalid={Boolean(form?.errors?.password)}
					/>
					<Button
						variant="ghost"
						size="icon-sm"
						class="absolute top-1/2 right-1 -translate-y-1/2 text-muted-foreground active:-translate-y-1/2"
						aria-label={showPassword ? "Hide password" : "Show password"}
						aria-pressed={showPassword}
						onclick={() => (showPassword = !showPassword)}
					>
						{#if showPassword}
							<EyeOff aria-hidden="true" />
						{:else}
							<Eye aria-hidden="true" />
						{/if}
					</Button>
				</div>
				{#if form?.errors?.password}
					<p data-field-error="password" class="field-error-message">{form.errors.password[0]}</p>
				{/if}
			</div>

			{#if data.captchaSiteKey}
				<Turnstile siteKey={data.captchaSiteKey} resetKey={form} />
			{/if}

			<Button type="submit" class="w-full">Sign in</Button>

			{#if data.socialProviders.length > 0}
				<div class="border-t border-border" aria-hidden="true"></div>
			{/if}
			<SocialAuthButtons providers={data.socialProviders} pending={socialPending} />
		</form>
	</Card.Content>
	<Card.Footer class="flex flex-col gap-2 text-sm">
		<a href="{base}/forgot-password" class="w-fit text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">Forgot password?</a>
		<p class="text-muted-foreground">
			Don't have an account? <a href="{base}/sign-up" class="font-medium text-foreground underline-offset-4 hover:underline">Sign up</a>
		</p>
	</Card.Footer>
</Card.Root>
