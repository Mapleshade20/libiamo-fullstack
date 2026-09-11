<script lang="ts">
import { tick } from "svelte";
import { enhance } from "$app/forms";
import { base } from "$app/paths";
import { isSocialProviderId, type SocialProviderId } from "$lib/auth/social";
import { focusAndHighlightField, handleInvalidField } from "$lib/client/form-attention";
import ActionNotification from "$lib/components/ActionNotification.svelte";
import SocialAuthButtons from "$lib/components/auth/SocialAuthButtons.svelte";
import FormErrorFocus from "$lib/components/FormErrorFocus.svelte";
import { Button } from "$lib/components/ui/button";
import * as Card from "$lib/components/ui/card";
import { Input } from "$lib/components/ui/input";
import { Label } from "$lib/components/ui/label";
import { LANGUAGE_CODES, LANGUAGE_LABELS } from "$lib/constants";

type SignUpFormState = {
	message?: string;
	values?: Partial<Record<"name" | "email" | "password" | "activeLanguage", string>>;
	errors?: Partial<Record<"name" | "email" | "password" | "activeLanguage", string[]>>;
};

let { form, data } = $props();
let formState = $derived(form as SignUpFormState | null | undefined);

let password = $state("");
let confirmPassword = $state("");
let confirmPasswordError = $state("");
let socialPending = $state<SocialProviderId | null>(null);

let signUpForm: HTMLFormElement | null = $state(null);
let confirmPasswordInput: HTMLInputElement | null = $state(null);

const actionNotification = $derived(
	formState?.message
		? { variant: "error" as const, title: "Unable to sign up", message: formState.message }
		: data.socialAuthError
			? { variant: "error" as const, title: "Unable to sign up", message: data.socialAuthError }
			: null,
);

// Clear mismatch error naturally when passwords match
$effect(() => {
	if (password === confirmPassword && confirmPasswordError) {
		confirmPasswordError = "";
	}
});
</script>

<svelte:head>
	<title>Sign Up · Libiamo</title>
	<meta name="description" content="Create a Libiamo account to practice language through real-world scenarios.">
</svelte:head>

<Card.Root>
	<Card.Header><Card.Title class="text-xl">Sign Up</Card.Title></Card.Header>
	<Card.Content>
		<ActionNotification notification={actionNotification} />
		<FormErrorFocus formRef={signUpForm} errors={formState?.errors} fieldOrder={["activeLanguage", "name", "email", "password"]} />

		<form
			bind:this={signUpForm}
			method="POST"
			oninvalidcapture={handleInvalidField}
			use:enhance={({ cancel, submitter }) => {
				const provider = submitter?.dataset.socialProvider;
				if (isSocialProviderId(provider)) {
					socialPending = provider;
					return async ({ update }) => {
						await update({ reset: false });
						socialPending = null;
					};
				}
				if (password !== confirmPassword) {
					confirmPasswordError = "Passwords do not match";
					void tick().then(() => {
						if (confirmPasswordInput) focusAndHighlightField(confirmPasswordInput);
					});
					cancel();
					return;
				}
				confirmPasswordError = "";
			}}
			class="space-y-4"
		>
			<div class="space-y-2">
				<Label for="activeLanguage">I want to learn</Label>
				<select
					id="activeLanguage"
					name="activeLanguage"
					class="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20"
					required
					aria-invalid={Boolean(formState?.errors?.activeLanguage)}
				>
					<option value="" disabled selected={!formState?.values?.activeLanguage}>Select a language</option>
					{#each LANGUAGE_CODES as code}
						<option value={code} selected={formState?.values?.activeLanguage === code}>{LANGUAGE_LABELS[code]}</option>
					{/each}
				</select>
				{#if formState?.errors?.activeLanguage}
					<p class="text-sm text-red-600">{formState.errors.activeLanguage[0]}</p>
				{/if}
			</div>

			<div class="space-y-2">
				<Label for="name">Name</Label>
				<Input id="name" name="name" value={formState?.values?.name ?? ""} required aria-invalid={Boolean(formState?.errors?.name)} />
				{#if formState?.errors?.name}
					<p class="text-sm text-red-600">{formState.errors.name[0]}</p>
				{/if}
			</div>

			<div class="space-y-2">
				<Label for="email">Email</Label>
				<Input
					id="email"
					name="email"
					type="email"
					value={formState?.values?.email ?? ""}
					required
					aria-invalid={Boolean(formState?.errors?.email)}
				/>
				{#if formState?.errors?.email}
					<p class="text-sm text-red-600">{formState.errors.email[0]}</p>
				{/if}
			</div>

			<div class="space-y-2">
				<Label for="password">Password</Label>
				<Input id="password" name="password" type="password" bind:value={password} required aria-invalid={Boolean(formState?.errors?.password)} />
				{#if formState?.errors?.password}
					<p class="text-sm text-red-600">{formState.errors.password[0]}</p>
				{/if}
			</div>

			<div class="space-y-2">
				<Label for="confirmPassword">Confirm Password</Label>
				<Input
					id="confirmPassword"
					bind:ref={confirmPasswordInput}
					type="password"
					bind:value={confirmPassword}
					required
					aria-invalid={Boolean(confirmPasswordError)}
				/>
				{#if confirmPasswordError}
					<p class="text-sm text-red-600">{confirmPasswordError}</p>
				{/if}
			</div>

			<Button type="submit" class="w-full">Sign Up</Button>

			{#if data.socialProviders.length > 0}
				<div class="border-t border-border/70" aria-hidden="true"></div>
			{/if}
			<SocialAuthButtons providers={data.socialProviders} pending={socialPending} />
		</form>
	</Card.Content>
	<Card.Footer class="text-sm">
		<p class="text-muted-foreground">
			Already have an account?
			<a href="{base}/sign-in" class="font-medium text-foreground hover:underline">Sign In</a>
		</p>
	</Card.Footer>
</Card.Root>
