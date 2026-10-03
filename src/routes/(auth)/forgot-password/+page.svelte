<script lang="ts">
import { tick } from "svelte";
import { enhance } from "$app/forms";
import { base } from "$app/paths";
import { checkPasswordStrength, preloadPasswordStrength } from "$lib/auth/password-strength";
import { clearFieldFeedback, focusAndHighlightField, handleInvalidField } from "$lib/client/form-attention";
import Turnstile from "$lib/components/auth/Turnstile.svelte";
import ActionNotification from "$lib/components/common/ActionNotification.svelte";
import FormErrorFocus from "$lib/components/common/FormErrorFocus.svelte";
import Notice from "$lib/components/common/Notice.svelte";
import { Button } from "$lib/components/ui/button";
import * as Card from "$lib/components/ui/card";
import { Input } from "$lib/components/ui/input";
import { Label } from "$lib/components/ui/label";

let { form, data } = $props();

let newPassword = $state("");
let confirmNewPassword = $state("");
let confirmNewPasswordError = $state("");
let newPasswordError = $state("");
let resetForm: HTMLFormElement | null = $state(null);
let requestForm: HTMLFormElement | null = $state(null);
let confirmNewPasswordInput: HTMLInputElement | null = $state(null);
let newPasswordInput: HTMLInputElement | null = $state(null);

const actionNotification = $derived(
	form?.emailSent
		? { variant: "success" as const, title: "Check your inbox", message: "If an account with that email exists, we've sent a reset link." }
		: form?.resetMessage
			? { variant: "error" as const, title: "Unable to reset password", message: form.resetMessage }
			: form?.captchaMessage
				? { variant: "error" as const, title: "Unable to send a reset link", message: form.captchaMessage }
				: null,
);
</script>

<svelte:head>
	<title>Reset Password · Libiamo</title>
	<meta name="description" content="Reset your Libiamo password and regain access to your account.">
</svelte:head>

<Card.Root>
	<Card.Header>
		<Card.Title>
			{#if data.hasToken}
				Reset password
			{:else}
				Forgot password
			{/if}
		</Card.Title>
	</Card.Header>
	<Card.Content>
		<ActionNotification notification={actionNotification} />
		{#if data.hasToken}
			{#if data.error}
				<!-- Invalid/expired token from URL — dedicated UX -->
				<Notice tone="danger" title="Invalid or expired link" class="mb-6">
					<p>The reset link is invalid or has expired. Please request a new one.</p>
					<Button href="{base}/forgot-password" variant="secondary" size="sm" class="mt-2">Request a new reset link</Button>
				</Notice>
			{:else}
				<!-- Reset form — stays visible on retryable server errors -->
				<FormErrorFocus formRef={resetForm} errors={form?.resetErrors} fieldOrder={["newPassword"]} />

				<form
					bind:this={resetForm}
					method="POST"
					action="?/resetPassword"
					oninvalidcapture={handleInvalidField}
					use:enhance={async ({ cancel }) => {
						if (newPassword !== confirmNewPassword) {
							confirmNewPasswordError = "Passwords do not match";
							void tick().then(() => {
								if (confirmNewPasswordInput) focusAndHighlightField(confirmNewPasswordInput);
							});
							cancel();
							return;
						}
						confirmNewPasswordError = "";
						const strength = await checkPasswordStrength(newPassword).catch(() => null);
						if (strength && !strength.ok) {
							newPasswordError = strength.warning;
							await tick();
							if (newPasswordInput) focusAndHighlightField(newPasswordInput);
							cancel();
							return;
						}
						newPasswordError = "";
					}}
					class="space-y-4"
				>
					<input type="hidden" name="token" value={data.token}>

					<div class="space-y-2">
						<Label for="newPassword">New password</Label>
						<Input
							id="newPassword"
							name="newPassword"
							type="password"
							bind:ref={newPasswordInput}
							bind:value={newPassword}
							onfocus={preloadPasswordStrength}
							oninput={() => { if (confirmNewPasswordInput) clearFieldFeedback(confirmNewPasswordInput); }}
							required
							aria-invalid={Boolean(newPasswordError || form?.resetErrors?.newPassword)}
						/>
						{#if newPasswordError || form?.resetErrors?.newPassword}
							<p data-field-error="newPassword" class="field-error-message">{newPasswordError || form?.resetErrors?.newPassword?.[0]}</p>
						{/if}
					</div>

					<div class="space-y-2">
						<Label for="confirmNewPassword">Confirm new password</Label>
						<Input
							id="confirmNewPassword"
							bind:ref={confirmNewPasswordInput}
							type="password"
							bind:value={confirmNewPassword}
							required
							aria-invalid={Boolean(confirmNewPasswordError)}
						/>
						{#if confirmNewPasswordError}
							<p data-field-error="confirmNewPassword" class="field-error-message">{confirmNewPasswordError}</p>
						{/if}
					</div>

					{#if data.captchaSiteKey}
						<Turnstile siteKey={data.captchaSiteKey} resetKey={form} />
					{/if}
					<Button type="submit" class="w-full">Reset password</Button>
				</form>
			{/if}
		{:else if form?.emailSent}
			<p class="text-center text-sm text-muted-foreground">If an account with that email exists, we've sent a reset link. Check your inbox.</p>
		{:else}
			<FormErrorFocus formRef={requestForm} errors={form?.errors} fieldOrder={["email"]} />
			<form bind:this={requestForm} method="POST" action="?/requestReset" use:enhance class="space-y-4" oninvalidcapture={handleInvalidField}>
				<div class="space-y-2">
					<Label for="email">Email</Label>
					<Input id="email" name="email" type="email" value={form?.values?.email ?? ""} required aria-invalid={Boolean(form?.errors?.email)} />
					{#if form?.errors?.email}
						<p data-field-error="email" class="field-error-message">{form.errors.email[0]}</p>
					{/if}
				</div>
				{#if data.captchaSiteKey}
					<Turnstile siteKey={data.captchaSiteKey} resetKey={form} />
				{/if}
				<Button type="submit" class="w-full">Send reset link</Button>
			</form>
		{/if}
	</Card.Content>
	<Card.Footer class="text-sm">
		<a href="{base}/sign-in" class="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">Back to sign in</a>
	</Card.Footer>
</Card.Root>
