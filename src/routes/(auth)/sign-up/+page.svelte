<script lang="ts">
import { onMount } from "svelte";
import { enhance } from "$app/forms";
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

<Card.Root>
	<Card.Header><Card.Title class="text-xl">Sign Up</Card.Title></Card.Header>
	<Card.Content>
		{#if form?.message}
			<p class="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{form.message}</p>
		{/if}

		<form
			method="POST"
			use:enhance={({ cancel }) => {
				if (password !== confirmPassword) {
					confirmPasswordError = "Passwords do not match";
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
				<Input id="name" name="name" value={form?.values?.name ?? ""} required />
				{#if form?.errors?.name}
					<p class="text-sm text-red-600">{form.errors.name[0]}</p>
				{/if}
			</div>

			<div class="space-y-2">
				<Label for="email">Email</Label>
				<Input id="email" name="email" type="email" value={form?.values?.email ?? ""} required />
				{#if form?.errors?.email}
					<p class="text-sm text-red-600">{form.errors.email[0]}</p>
				{/if}
			</div>

			<div class="space-y-2">
				<Label for="password">Password</Label>
				<Input id="password" name="password" type="password" bind:value={password} required />
				{#if form?.errors?.password}
					<p class="text-sm text-red-600">{form.errors.password[0]}</p>
				{/if}
			</div>

			<div class="space-y-2">
				<Label for="confirmPassword">Confirm Password</Label>
				<Input id="confirmPassword" type="password" bind:value={confirmPassword} required />
				{#if confirmPasswordError}
					<p class="text-sm text-red-600">{confirmPasswordError}</p>
				{/if}
			</div>

			<div class="space-y-2">
				<Label for="activeLanguage">I want to learn</Label>
				<select
					id="activeLanguage"
					name="activeLanguage"
					class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
					required
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

			<!-- BYOK: optional API key section -->
			<details class="space-y-3 rounded-md border border-input p-3">
				<summary class="cursor-pointer text-sm font-medium text-muted-foreground">Bring Your Own Key (optional)</summary>
				<div class="mt-3 space-y-3">
					<p class="text-xs text-muted-foreground">
						Provide your own OpenAI-compatible API key. If left empty, the default platform key will be used. Your key is encrypted before storage.
					</p>
					{#if form?.message}
						<p class="rounded-md bg-red-50 p-3 text-sm text-red-700">{form.message}</p>
					{/if}
					<div class="space-y-2">
						<Label for="apiKey">API Key</Label>
						<Input id="apiKey" name="apiKey" type="password" value={form?.values?.apiKey ?? ""} placeholder="sk-..." />
						{#if form?.errors?.apiKey}
							<p class="text-sm text-red-600">{form.errors.apiKey[0]}</p>
						{/if}
					</div>
					<div class="space-y-2">
						<Label for="apiBaseUrl">Base URL</Label>
						<Input id="apiBaseUrl" name="apiBaseUrl" value={form?.values?.apiBaseUrl ?? ""} placeholder="https://api.openai.com/v1" />
						{#if form?.errors?.apiBaseUrl}
							<p class="text-sm text-red-600">{form.errors.apiBaseUrl[0]}</p>
						{/if}
					</div>
					<div class="space-y-2">
						<Label for="apiModel">Model</Label>
						<Input id="apiModel" name="apiModel" value={form?.values?.apiModel ?? ""} placeholder="gpt-4o" />
						{#if form?.errors?.apiModel}
							<p class="text-sm text-red-600">{form.errors.apiModel[0]}</p>
						{/if}
					</div>
				</div>
			</details>
			<!-- End BYOK section -->

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
