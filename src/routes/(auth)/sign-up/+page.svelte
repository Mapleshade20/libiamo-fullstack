<script lang="ts">
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
let suppressServerErrors = $state(false);
</script>

<Card.Root>
	<Card.Header> <Card.Title class="text-xl">Sign Up</Card.Title> </Card.Header>
	<Card.Content>
		{#if form?.message && !suppressServerErrors}
			<p class="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{form.message}</p>
		{/if}

		<form
			method="POST"
			use:enhance={({ cancel }) => {
				suppressServerErrors = true;

				if (password !== confirmPassword) {
					confirmPasswordError = "Passwords do not match";
					cancel();
					return;
				}
				confirmPasswordError = "";

				return async ({ update }) => {
					suppressServerErrors = false;
					await update();
				};
			}}
			class="space-y-4"
		>
			<div class="space-y-2">
				<Label for="name">Name</Label>
				<Input id="name" name="name" value={form?.values?.name ?? ""} required />
				{#if form?.errors?.name && !suppressServerErrors}
					<p class="text-sm text-red-600">{form.errors.name[0]}</p>
				{/if}
			</div>

			<div class="space-y-2">
				<Label for="email">Email</Label>
				<Input id="email" name="email" type="email" value={form?.values?.email ?? ""} required />
				{#if form?.errors?.email && !suppressServerErrors}
					<p class="text-sm text-red-600">{form.errors.email[0]}</p>
				{/if}
			</div>

			<div class="space-y-2">
				<Label for="password">Password</Label>
				<Input id="password" name="password" type="password" bind:value={password} required />
				{#if form?.errors?.password && !suppressServerErrors}
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
				{#if form?.errors?.activeLanguage && !suppressServerErrors}
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
