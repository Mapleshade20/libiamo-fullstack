<script lang="ts">
import { enhance } from "$app/forms";
import { Button } from "$lib/components/ui/button";
import * as Card from "$lib/components/ui/card";
import { Input } from "$lib/components/ui/input";
import { Label } from "$lib/components/ui/label";

let { form, data } = $props();

let newPassword = $state("");
let confirmNewPassword = $state("");
let confirmNewPasswordError = $state("");

// Clear mismatch error naturally when passwords match
$effect(() => {
	if (newPassword === confirmNewPassword && confirmNewPasswordError) {
		confirmNewPasswordError = "";
	}
});
</script>

<Card.Root>
	<Card.Header>
		<Card.Title class="text-xl">
			{#if data.hasToken}
				Reset Password
			{:else}
				Forgot Password
			{/if}
		</Card.Title>
	</Card.Header>
	<Card.Content>
		{#if data.hasToken}
			{#if data.error}
				<!-- Invalid/expired token from URL — dedicated UX -->
				<div class="mb-6 rounded-md bg-red-50 p-4 border border-red-200">
					<p class="text-sm text-red-700 font-medium">Invalid or Expired Link</p>
					<p class="text-sm text-red-600 mt-1">The reset link is invalid or has expired. Please request a new one.</p>
					<a href="/forgot-password" class="mt-4 block text-sm underline text-blue-600 hover:text-blue-800"> Request a new reset link </a>
				</div>
			{:else}
				<!-- Reset form — stays visible on retryable server errors -->
				{#if form?.resetMessage}
					<p class="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{form.resetMessage}</p>
				{/if}

				<form
					method="POST"
					action="?/resetPassword"
					use:enhance={({ cancel }) => {
						if (newPassword !== confirmNewPassword) {
							confirmNewPasswordError = "Passwords do not match";
							cancel();
							return;
						}
						confirmNewPasswordError = "";
					}}
					class="space-y-4"
				>
					<input type="hidden" name="token" value={data.token}>

					<div class="space-y-2">
						<Label for="newPassword">New Password</Label>
						<Input id="newPassword" name="newPassword" type="password" bind:value={newPassword} required />
						{#if form?.resetErrors?.newPassword}
							<p class="text-sm text-red-600">{form.resetErrors.newPassword[0]}</p>
						{/if}
					</div>

					<div class="space-y-2">
						<Label for="confirmNewPassword">Confirm New Password</Label>
						<Input id="confirmNewPassword" type="password" bind:value={confirmNewPassword} required />
						{#if confirmNewPasswordError}
							<p class="text-sm text-red-600">{confirmNewPasswordError}</p>
						{/if}
					</div>

					<Button type="submit" class="w-full">Reset Password</Button>
				</form>
			{/if}
		{:else if form?.emailSent}
			<p class="text-center text-muted-foreground">If an account with that email exists, we've sent a reset link. Check your inbox.</p>
		{:else}
			<form method="POST" action="?/requestReset" use:enhance class="space-y-4">
				<div class="space-y-2">
					<Label for="email">Email</Label>
					<Input id="email" name="email" type="email" value={form?.values?.email ?? ""} required />
					{#if form?.errors?.email}
						<p class="text-sm text-red-600">{form.errors.email[0]}</p>
					{/if}
				</div>
				<Button type="submit" class="w-full">Send Reset Link</Button>
			</form>
		{/if}
	</Card.Content>
	<Card.Footer class="text-sm"> <a href="/sign-in" class="text-muted-foreground hover:underline">Back to Sign In</a> </Card.Footer>
</Card.Root>
