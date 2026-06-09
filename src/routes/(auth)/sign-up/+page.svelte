<script lang="ts">
import { onMount, tick } from "svelte";
import { enhance } from "$app/forms";
import { focusAndHighlightField, handleInvalidField } from "$lib/client/form-attention";
import ActionNotification from "$lib/components/ActionNotification.svelte";
import FormErrorFocus from "$lib/components/FormErrorFocus.svelte";
import { Button } from "$lib/components/ui/button";
import * as Card from "$lib/components/ui/card";
import { Input } from "$lib/components/ui/input";
import { Label } from "$lib/components/ui/label";
import { LANGUAGE_CODES, LANGUAGE_LABELS } from "$lib/constants";

let { form } = $props();

let password = $state("");
let confirmPassword = $state("");
let confirmPasswordError = $state("");

let clientTimezone = $state("UTC");
let signUpForm: HTMLFormElement | null = $state(null);
let confirmPasswordInput: HTMLInputElement | null = $state(null);

const actionNotification = $derived(form?.message ? { variant: "error" as const, title: "Unable to sign up", message: form.message } : null);

onMount(() => {
	clientTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
});

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
		<FormErrorFocus formRef={signUpForm} errors={form?.errors} fieldOrder={["name", "email", "password", "activeLanguage"]} />

		<form
			bind:this={signUpForm}
			method="POST"
			oninvalidcapture={handleInvalidField}
			use:enhance={({ cancel }) => {
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
			<input type="hidden" name="timezone" value={clientTimezone}>

			<div class="space-y-2">
				<Label for="name">Name</Label>
				<Input id="name" name="name" value={form?.values?.name ?? ""} required aria-invalid={Boolean(form?.errors?.name)} />
				{#if form?.errors?.name}
					<p class="text-sm text-red-600">{form.errors.name[0]}</p>
				{/if}
			</div>

			<div class="space-y-2">
				<Label for="email">Email</Label>
				<Input id="email" name="email" type="email" value={form?.values?.email ?? ""} required aria-invalid={Boolean(form?.errors?.email)} />
				{#if form?.errors?.email}
					<p class="text-sm text-red-600">{form.errors.email[0]}</p>
				{/if}
			</div>

			<div class="space-y-2">
				<Label for="password">Password</Label>
				<Input id="password" name="password" type="password" bind:value={password} required aria-invalid={Boolean(form?.errors?.password)} />
				{#if form?.errors?.password}
					<p class="text-sm text-red-600">{form.errors.password[0]}</p>
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

			<div class="space-y-2">
				<Label for="activeLanguage">I want to learn</Label>
				<select
					id="activeLanguage"
					name="activeLanguage"
					class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20"
					required
					aria-invalid={Boolean(form?.errors?.activeLanguage)}
				>
					<option value="" disabled selected={!form?.values?.activeLanguage}>Select a language</option>
					{#each LANGUAGE_CODES as code}
						<option value={code} selected={form?.values?.activeLanguage === code}>{LANGUAGE_LABELS[code]}</option>
					{/each}
				</select>
				{#if form?.errors?.activeLanguage}
					<p class="text-sm text-red-600">{form.errors.activeLanguage[0]}</p>
				{/if}
			</div>

			<Button type="submit" class="w-full">Sign Up</Button>
		</form>
	</Card.Content>
	<Card.Footer class="text-sm">
		<p class="text-muted-foreground">
			Already have an account?
			<a href="/sign-in" class="font-medium text-foreground hover:underline">Sign In</a>
		</p>
	</Card.Footer>
</Card.Root>
