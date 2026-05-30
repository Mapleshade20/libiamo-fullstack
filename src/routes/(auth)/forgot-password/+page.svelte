<script lang="ts">
import { tick } from "svelte";
import { enhance } from "$app/forms";
import ActionNotification from "$lib/components/ActionNotification.svelte";
import FormErrorFocus from "$lib/components/FormErrorFocus.svelte";
import { Button } from "$lib/components/ui/button";
import * as Card from "$lib/components/ui/card";
import { Input } from "$lib/components/ui/input";
import { Label } from "$lib/components/ui/label";
import { focusAndHighlightField, handleInvalidField } from "$lib/form-attention";

let { form, data } = $props();

let newPassword = $state("");
let confirmNewPassword = $state("");
let confirmNewPasswordError = $state("");
let resetForm: HTMLFormElement | null = $state(null);
let requestForm: HTMLFormElement | null = $state(null);
let confirmNewPasswordInput: HTMLInputElement | null = $state(null);

const actionNotification = $derived(
	form?.emailSent
		? { variant: "success" as const, title: "Check your inbox", message: "If an account with that email exists, we've sent a reset link." }
		: form?.resetMessage
			? { variant: "error" as const, title: "Unable to reset password", message: form.resetMessage }
			: null,
);

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
		<ActionNotification notification={actionNotification} />
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
				<FormErrorFocus formRef={resetForm} errors={form?.resetErrors} fieldOrder={["newPassword"]} />

				<form
					bind:this={resetForm}
					method="POST"
					action="?/resetPassword"
					oninvalidcapture={handleInvalidField}
					use:enhance={({ cancel }) => {
						if (newPassword !== confirmNewPassword) {
							confirmNewPasswordError = "Passwords do not match";
							void tick().then(() => {
								if (confirmNewPasswordInput) focusAndHighlightField(confirmNewPasswordInput);
							});
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
						<Input
							id="newPassword"
							name="newPassword"
							type="password"
							bind:value={newPassword}
							required
							aria-invalid={Boolean(form?.resetErrors?.newPassword)}
						/>
						{#if form?.resetErrors?.newPassword}
							<p class="text-sm text-red-600">{form.resetErrors.newPassword[0]}</p>
						{/if}
					</div>

					<div class="space-y-2">
						<Label for="confirmNewPassword">Confirm New Password</Label>
						<Input
							id="confirmNewPassword"
							bind:ref={confirmNewPasswordInput}
							type="password"
							bind:value={confirmNewPassword}
							required
							aria-invalid={Boolean(confirmNewPasswordError)}
						/>
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
			<FormErrorFocus formRef={requestForm} errors={form?.errors} fieldOrder={["email"]} />
			<form bind:this={requestForm} method="POST" action="?/requestReset" use:enhance class="space-y-4" oninvalidcapture={handleInvalidField}>
				<div class="space-y-2">
					<Label for="email">Email</Label>
					<Input id="email" name="email" type="email" value={form?.values?.email ?? ""} required aria-invalid={Boolean(form?.errors?.email)} />
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
