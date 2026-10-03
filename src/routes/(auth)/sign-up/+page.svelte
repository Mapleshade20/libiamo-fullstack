<script lang="ts">
import { tick } from "svelte";
import { enhance } from "$app/forms";
import { base } from "$app/paths";
import { isSocialProviderId, type SocialProviderId } from "$lib/auth/social";
import { clearFieldFeedback, focusAndHighlightField, handleInvalidField } from "$lib/client/form-attention";
import SocialAuthButtons from "$lib/components/auth/SocialAuthButtons.svelte";
import Turnstile from "$lib/components/auth/Turnstile.svelte";
import ActionNotification from "$lib/components/common/ActionNotification.svelte";
import FormErrorFocus from "$lib/components/common/FormErrorFocus.svelte";
import Select from "$lib/components/common/Select.svelte";
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
</script>

<svelte:head>
	<title>Sign Up · Libiamo</title>
	<meta name="description" content="Create a Libiamo account to practice language through real-world scenarios.">
</svelte:head>

<Card.Root>
	<Card.Header><Card.Title>Sign up</Card.Title></Card.Header>
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
				<Select
					id="activeLanguage"
					name="activeLanguage"
					required
					placeholder="Select a language"
					value={formState?.values?.activeLanguage ?? ""}
					aria-invalid={Boolean(formState?.errors?.activeLanguage)}
					items={LANGUAGE_CODES.map((code) => ({ value: code, label: LANGUAGE_LABELS[code] }))}
				/>
				{#if formState?.errors?.activeLanguage}
					<p data-field-error="activeLanguage" class="field-error-message">{formState.errors.activeLanguage[0]}</p>
				{/if}
			</div>

			<!-- Everything below stays collapsed until a language is chosen. The state
			     lives entirely in CSS (see the `:has(option[value=""]:checked)` rule on the
			     Select's native mirror) so
			     the form still works with scripting off, and `visibility: hidden` keeps
			     the collapsed fields out of the tab order without an `inert` attribute.
			     They keep their `required` attributes: the select is required too and
			     comes first in tree order, so it is what the browser reports on. -->
			<div class="reveal">
				<div class="reveal-inner">
					<div class="space-y-4 pt-4">
						<div class="space-y-2">
							<Label for="name">Name</Label>
							<Input id="name" name="name" value={formState?.values?.name ?? ""} required aria-invalid={Boolean(formState?.errors?.name)} />
							{#if formState?.errors?.name}
								<p data-field-error="name" class="field-error-message">{formState.errors.name[0]}</p>
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
								aria-describedby={formState?.errors?.email ? undefined : "email-help"}
							/>
							{#if formState?.errors?.email}
								<p data-field-error="email" class="field-error-message">{formState.errors.email[0]}</p>
							{:else}
								<p id="email-help" class="text-sm text-muted-foreground">
									We accept Gmail, iCloud, Apple, Microsoft, Yahoo, QQ, Foxmail, 126, 163, Sina and school (edu) addresses.
								</p>
							{/if}
						</div>

						<div class="space-y-2">
							<Label for="password">Password</Label>
							<Input
								id="password"
								name="password"
								type="password"
								bind:value={password}
								oninput={() => { if (confirmPasswordInput) clearFieldFeedback(confirmPasswordInput); }}
								required
								aria-invalid={Boolean(formState?.errors?.password)}
							/>
							{#if formState?.errors?.password}
								<p data-field-error="password" class="field-error-message">{formState.errors.password[0]}</p>
							{/if}
						</div>

						<div class="space-y-2">
							<Label for="confirmPassword">Confirm password</Label>
							<Input
								id="confirmPassword"
								bind:ref={confirmPasswordInput}
								type="password"
								bind:value={confirmPassword}
								required
								aria-invalid={Boolean(confirmPasswordError)}
							/>
							{#if confirmPasswordError}
								<p data-field-error="confirmPassword" class="field-error-message">{confirmPasswordError}</p>
							{/if}
						</div>

						{#if data.captchaSiteKey}
							<Turnstile siteKey={data.captchaSiteKey} resetKey={form} />
						{/if}

						<Button type="submit" class="w-full">Sign up</Button>
						<p class="text-sm text-muted-foreground">
							Your free AI trial arrives in three parts: a third when you sign up, another a day later and the rest on day three.
						</p>

						{#if data.socialProviders.length > 0}
							<div class="border-t border-border" aria-hidden="true"></div>
						{/if}
						<SocialAuthButtons providers={data.socialProviders} pending={socialPending} />
					</div>
				</div>
			</div>
		</form>
	</Card.Content>
	<Card.Footer class="text-sm">
		<p class="text-muted-foreground">
			Already have an account?
			<a href="{base}/sign-in" class="font-medium text-foreground underline-offset-4 hover:underline">Sign in</a>
		</p>
	</Card.Footer>
</Card.Root>

<style>
/* `0fr` → `1fr` is the only way to animate to a height nobody has measured, and
   unlike a `max-height` guess it lands exactly on the content's own height. */
.reveal {
	display: grid;
	grid-template-rows: 1fr;
	transition: grid-template-rows 320ms var(--ease-panel);
}
.reveal-inner {
	overflow: hidden;
	/* Transitioned discretely: applies at once when revealing, and waits for the
	   row to finish collapsing when hiding. Also drops the fields from the tab
	   order while they are clipped, which `overflow: hidden` alone does not. */
	visibility: visible;
	transition: visibility 320ms;
}

/* The placeholder `<option value="">` stays `:checked` until a language is picked,
   so the whole reveal is driven by the select itself — no JavaScript, and a server
   render that echoes a chosen language back comes out expanded on the first paint
   rather than flashing shut. */
form:has(:global(select[name="activeLanguage"] option[value=""]:checked)) .reveal {
	grid-template-rows: 0fr;
}
form:has(:global(select[name="activeLanguage"] option[value=""]:checked)) .reveal-inner {
	visibility: hidden;
}

@media (prefers-reduced-motion: reduce) {
	.reveal,
	.reveal-inner {
		transition: none;
	}
}
</style>
