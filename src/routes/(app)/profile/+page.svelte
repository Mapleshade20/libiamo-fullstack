<script lang="ts">
import Check from "@lucide/svelte/icons/check";
import ExternalLink from "@lucide/svelte/icons/external-link";
import KeyRound from "@lucide/svelte/icons/key-round";
import LoaderCircle from "@lucide/svelte/icons/loader-circle";
import { onDestroy, onMount, tick } from "svelte";
import { enhance } from "$app/forms";
import { afterNavigate, replaceState } from "$app/navigation";
import { base } from "$app/paths";
import { trialQuotaPercent, trialQuotaWarning } from "$lib/account/trial-release";
import { checkPasswordStrength, preloadPasswordStrength } from "$lib/auth/password-strength";
import type { AccountActionResult, SocialAuthFailure, SocialProviderId } from "$lib/auth/social";
import { handleInvalidField } from "$lib/client/form-attention";
import ProfileNameEditor from "$lib/components/account/ProfileNameEditor.svelte";
import SocialProviderIcon from "$lib/components/auth/SocialProviderIcon.svelte";
import Turnstile from "$lib/components/auth/Turnstile.svelte";
import ActionNotification from "$lib/components/common/ActionNotification.svelte";
import ChoiceGroup from "$lib/components/common/ChoiceGroup.svelte";
import ConfirmDialog from "$lib/components/common/ConfirmDialog.svelte";
import FormErrorFocus from "$lib/components/common/FormErrorFocus.svelte";
import InfoTip from "$lib/components/common/InfoTip.svelte";
import ModalDialog from "$lib/components/common/ModalDialog.svelte";
import Notice from "$lib/components/common/Notice.svelte";
import Select from "$lib/components/common/Select.svelte";
import Switch from "$lib/components/common/Switch.svelte";
import { Badge } from "$lib/components/ui/badge";
import { Button } from "$lib/components/ui/button";
import * as Card from "$lib/components/ui/card";
import { Input } from "$lib/components/ui/input";
import { Label } from "$lib/components/ui/label";
import { Separator } from "$lib/components/ui/separator";
import type { LanguageCode } from "$lib/constants";
import {
	AUTH_PASSWORD_MAX_LENGTH,
	AUTH_PASSWORD_MIN_LENGTH,
	BYOK_API_BASE_URL_LABELS,
	BYOK_API_BASE_URLS,
	BYOK_API_PRESETS,
	type ByokApiBaseUrl,
	DIFFICULTY_CEFR,
	difficultyLabelKey,
	SELF_ASSIGNED_LEVELS,
} from "$lib/constants";
import { t } from "$lib/i18n";
import { ADDRESSEE_BETA_MODEL, hasAddresseeBeta } from "$lib/practice/addressee";
import { getDisplayClock } from "$lib/time/display-clock";

/**
 * Which notice each refusal gets. The cases a user cannot respond to differently
 * share the generic one rather than each earning a string in four languages.
 */
const FAILURE_NOTICE_KEYS: Record<SocialAuthFailure, string> = {
	cancelled: "profile.methodCancelled",
	"already-linked-elsewhere": "profile.methodAlreadyLinked",
	"provider-email-unverified": "profile.methodUnverified",
	"stale-session": "profile.methodStaleSession",
	// Reachable only when signed out, where the sign-in page explains it instead.
	"account-exists": "profile.methodError",
	error: "profile.methodError",
};

const FEEDBACK_PREFERENCES = ["native", "target"] as const;

let { form, data } = $props();
let nativeLanguageForm: HTMLFormElement | null = $state(null);
let proficiencyForm: HTMLFormElement | null = $state(null);
let lang = $derived(data.user.activeLanguage as LanguageCode);
const clock = getDisplayClock();
let hasGravatarPhoto = $state<boolean | null>(null);

/**
 * Every failure answers `true`, matching `hasGravatarAvatar`: the connected
 * sentence holds either way, and telling someone who already uploaded a photo to
 * go add one is the wrong guess. Staying `null` would strand the checking
 * sentence — a stale session redirects this fetch to sign-in HTML, so a parse
 * failure here is routine rather than exceptional.
 */
onMount(() => {
	const controller = new AbortController();

	void fetch(`${base}/profile/avatar-status`, { headers: { accept: "application/json" }, signal: controller.signal })
		.then(async (response) => {
			if (!response.ok) return true;
			const result: unknown = await response.json();
			return typeof result === "object" && result !== null && "hasGravatarPhoto" in result && typeof result.hasGravatarPhoto === "boolean"
				? result.hasGravatarPhoto
				: true;
		})
		.then((result) => {
			hasGravatarPhoto = result;
		})
		.catch(() => {
			if (!controller.signal.aborted) hasGravatarPhoto = true;
		});

	return () => controller.abort();
});

const nativeLanguageOptions = $derived(data.serverNativeLanguages ?? []);

let nativeLanguageInputValue = $derived(form?.values?.nativeLanguage ?? data.user.nativeLanguage ?? "");
let apiBaseUrlValue = $derived(form?.values?.apiBaseUrl ?? data.apiBaseUrl ?? "");
let apiModelValue = $derived(form?.values?.apiModel ?? data.apiModel ?? "");
let apiKeyValue = $state("");
const canRetainApiKey = $derived(data.hasApiKey && apiBaseUrlValue === data.apiBaseUrl);
const apiModelPlaceholder = $derived(BYOK_API_PRESETS.find((preset) => preset.baseUrl === apiBaseUrlValue)?.model ?? BYOK_API_PRESETS[0].model);
let apiKeyInput: HTMLInputElement | null = $state(null);

function applyApiPreset(preset: (typeof BYOK_API_PRESETS)[number]) {
	// Same rule as picking the provider by hand: a key never follows a base URL change.
	if (apiBaseUrlValue !== preset.baseUrl) apiKeyValue = "";
	apiBaseUrlValue = preset.baseUrl;
	apiModelValue = preset.model;
	apiKeyInput?.focus();
}
let apiKeyForm: HTMLFormElement | null = $state(null);
/** "Using your own key · OpenRouter · model", from what is saved rather than what is being edited. */
const apiKeySummary = $derived(
	[
		t(lang, "profile.apiConfigured"),
		data.apiBaseUrl ? (BYOK_API_BASE_URL_LABELS[data.apiBaseUrl as ByokApiBaseUrl] ?? data.apiBaseUrl) : "",
		data.apiModel ?? "",
	]
		.filter(Boolean)
		.join(" · "),
);
let showActionNotification = $state(false);
let accountPending = $state<SocialProviderId | null>(null);
let passwordSetupPending = $state(false);
let emailChangePending = $state(false);
let emailChangeForm = $state<HTMLFormElement | null>(null);
let emailDialogOpen = $state(false);
// The address a verification link just went to; while set, the dialog shows that instead of the form.
let emailSentTo = $state<string | null>(null);
let emailDoneButton = $state<HTMLButtonElement | null>(null);
let newEmailInput = $state<HTMLInputElement | null>(null);
let passwordChangePending = $state(false);
let passwordChangeForm = $state<HTMLFormElement | null>(null);
let passwordDialogOpen = $state(false);
// Found before the round trip, so they never reach the server or spend the human check.
let localPasswordError = $state<{ field: "newPassword" | "confirmNewPassword"; message: string } | null>(null);
// zxcvbn only speaks English; other interfaces get the general advice instead of its specific warning.
const passwordWarning = (warning: string | undefined) => (lang === "en" && warning ? warning : t(lang, "profile.passwordWeak"));
const passwordErrors = $derived.by((): Partial<Record<"currentPassword" | "newPassword" | "confirmNewPassword", string[]>> => {
	if (localPasswordError) return { [localPasswordError.field]: [localPasswordError.message] };
	switch (form?.passwordChange) {
		case "wrong":
			return { currentPassword: [t(lang, "profile.passwordWrong")] };
		case "short":
			return { newPassword: [t(lang, "profile.passwordTooShort")] };
		case "long":
			return { newPassword: [t(lang, "profile.passwordTooLong")] };
		case "weak":
			return { newPassword: [passwordWarning(form.passwordWarning)] };
		case "mismatch":
			return { confirmNewPassword: [t(lang, "profile.passwordMismatch")] };
		default:
			return {};
	}
});
// The confirmation dialog drives the unlink forms rather than owning the POST, so
// disconnecting still runs through the same `use:enhance` path as every other action.
let disconnectForms = $state<Partial<Record<SocialProviderId, HTMLFormElement>>>({});
let confirmOpen = $state(false);
let confirmingProvider = $state<SocialProviderId | null>(null);
let confirmingMethod = $derived(data.socialLoginMethods.find((method: { id: SocialProviderId }) => method.id === confirmingProvider));
let accountFormResult = $derived((form as { accountResult?: AccountActionResult } | null | undefined)?.accountResult);

// `?linked=` / `?error=` describe the OAuth round-trip that just landed on this
// page, nothing after it. `use:enhance` never rewrites the URL, so once any form
// action has reported back we must stop consulting them — otherwise a saved
// profile keeps announcing "login method connected", and a single failed link
// turns every later save into "login method unchanged".
let landedAccountResult = $derived(data.accountFailure ?? data.accountResult);
let accountResult: AccountActionResult | null | undefined = $derived(form ? accountFormResult : landedAccountResult);

// Drop the parameters once consumed so a reload does not replay the notification.
// `replaceState` leaves `data` untouched, so the notice still shows this time.
afterNavigate(() => {
	const url = new URL(location.href);
	if (!url.searchParams.has("linked") && !url.searchParams.has("error")) return;
	url.searchParams.delete("linked");
	url.searchParams.delete("error");
	replaceState(`${url.pathname}${url.search}${url.hash}`, {});
});

const actionNotification = $derived.by(() => {
	if (accountResult === "connected") {
		return { variant: "success" as const, title: t(lang, "profile.methodConnectedTitle"), message: t(lang, "profile.methodConnectedMessage") };
	}
	if (accountResult === "disconnected") {
		return { variant: "success" as const, title: t(lang, "profile.methodDisconnectedTitle"), message: t(lang, "profile.methodDisconnectedMessage") };
	}
	if (accountResult) {
		const key = FAILURE_NOTICE_KEYS[accountResult];
		return { variant: "error" as const, title: t(lang, `${key}Title`), message: t(lang, `${key}Message`) };
	}
	// Not gated on `showActionNotification`: only one action ever sets this key, so
	// unlike `success` there is no autosave whose result it could be mistaken for —
	// and gating it would swallow the notice entirely on a scriptless form post.
	if (form?.passwordSetupSent) {
		return {
			variant: "success" as const,
			title: t(lang, "profile.passwordSetupSentTitle"),
			message: t(lang, "profile.passwordSetupSentMessage").replace("{email}", data.user.email),
		};
	}
	if (form?.passwordSetupSent === false) {
		return { variant: "error" as const, title: t(lang, "profile.passwordSetupFailedTitle"), message: t(lang, "profile.passwordSetupFailedMessage") };
	}
	if (!showActionNotification) return null;
	if (form?.success) return { variant: "success" as const, title: t(lang, "profile.updatedTitle"), message: t(lang, "profile.updatedMessage") };
	if (form?.message) return { variant: "error" as const, title: t(lang, "profile.unableSave"), message: form.message };
	return null;
});

const GRAVATAR_LINK =
	'<a href="https://gravatar.com" target="_blank" rel="noopener noreferrer" class="font-medium text-primary hover:underline">Gravatar</a>';

/**
 * One line about the avatar, not two: the invitation to upload a photo only
 * applies while Gravatar holds none for this address. The link is spliced into
 * the sentence rather than placed beside it in the markup, because template
 * whitespace would then land a space before the English period and around the
 * Japanese particle. Only in-repo copy reaches `{@html}`.
 */
const avatarSentence = $derived(
	t(lang, hasGravatarPhoto === null ? "profile.avatarChecking" : hasGravatarPhoto ? "profile.avatarConnected" : "profile.avatarMissing").replace(
		"{link}",
		GRAVATAR_LINK,
	),
);

function formatConnectedAt(isoDate: string) {
	return new Intl.DateTimeFormat(lang, { dateStyle: "medium", timeZone: clock().timeZone }).format(new Date(isoDate));
}

let trialPercent = $derived(data.trialQuota ? trialQuotaPercent(data.trialQuota) : 0);
let trialTone = $derived((data.trialQuota && trialQuotaWarning(data.trialQuota)) ?? "normal");
let trialNextRelease = $derived(
	data.trialQuota?.trialNextReleaseAt
		? new Intl.DateTimeFormat(lang, { dateStyle: "medium", timeStyle: "short", timeZone: clock().timeZone }).format(
				data.trialQuota.trialNextReleaseAt,
			)
		: null,
);

function formatTokenCount(value: number) {
	return new Intl.NumberFormat("en-US").format(Math.max(0, value));
}

function autosave(event: Event) {
	(event.currentTarget as HTMLFormElement).requestSubmit();
}

/**
 * Autosaved sections say so beside their title: "Saving…", then "Saved" for a moment, then nothing.
 * A refusal surfaces through the page notification or the field's own message instead. "Saving…"
 * holds for a beat before "Saved" may replace it, because a local round trip can finish in a few
 * milliseconds and a state that brief reads as a flicker rather than as an answer.
 */
const AUTOSAVE_SAVING_MIN_MS = 450;
const AUTOSAVE_SAVED_MS = 2500;
type AutosaveSection = "settings" | "llm";
let autosaveStatus = $state<Partial<Record<AutosaveSection, "saving" | "saved">>>({});
const statusTimers: Partial<Record<AutosaveSection, ReturnType<typeof setTimeout>>> = {};
const savingStartedAt: Partial<Record<AutosaveSection, number>> = {};
onDestroy(() => Object.values(statusTimers).forEach(clearTimeout));

/** Shows "saved" no sooner than the beat, then clears it again. */
function showSaved(section: AutosaveSection) {
	const remaining = Math.max(0, AUTOSAVE_SAVING_MIN_MS - (Date.now() - (savingStartedAt[section] ?? 0)));
	statusTimers[section] = setTimeout(() => {
		autosaveStatus[section] = "saved";
		statusTimers[section] = setTimeout(() => (autosaveStatus[section] = undefined), AUTOSAVE_SAVED_MS);
	}, remaining);
}

function enhanceAutosave(section: AutosaveSection) {
	return () => {
		showActionNotification = false;
		// A save starting now supersedes whatever the last one was about to show.
		clearTimeout(statusTimers[section]);
		autosaveStatus[section] = "saving";
		savingStartedAt[section] = Date.now();
		return async ({ result, update }: { result: { type: string }; update: (options?: { reset?: boolean }) => Promise<void> }) => {
			await update({ reset: false });
			// A refusal answers through the page notification right away; only a save that
			// landed earns the beat.
			if (result.type !== "success") {
				autosaveStatus[section] = undefined;
				showActionNotification = true;
				return;
			}
			showSaved(section);
		};
	};
}

let removeApiKeyForm: HTMLFormElement | null = $state(null);
let removeApiKeyOpen = $state(false);
let removeApiKeyPending = $state(false);

function enhanceLoginMethod(provider: SocialProviderId) {
	return () => {
		accountPending = provider;
		showActionNotification = true;
		return async ({ update }: { update: (options?: { reset?: boolean }) => Promise<void> }) => {
			await update({ reset: false });
			accountPending = null;
			// Whether the unlink went through or failed, the answer is in the
			// notification above the card, so the dialog steps out of the way.
			confirmOpen = false;
		};
	};
}

/** Names the method the dialog is about; the row's form does the actual work. */
function askDisconnect(provider: SocialProviderId) {
	confirmingProvider = provider;
	confirmOpen = true;
}

function confirmDisconnect() {
	if (confirmingProvider) disconnectForms[confirmingProvider]?.requestSubmit();
}

function enhancePasswordSetup() {
	passwordSetupPending = true;
	showActionNotification = true;
	return async ({ update }: { update: (options?: { reset?: boolean }) => Promise<void> }) => {
		await update({ reset: false });
		passwordSetupPending = false;
	};
}
</script>

<svelte:head>
	<title>{t(lang, "profile.title")} · Libiamo</title>
	<meta name="description" content={t(lang, "profile.description")}>
</svelte:head>

<div class="mx-auto max-w-2xl space-y-8">
	<h1 class="text-3xl">{t(lang, "profile.title")}</h1>

	<ActionNotification notification={actionNotification} />

	<Card.Root>
		<Card.Content>
			<div class="flex items-center gap-6">
				<img src={data.avatarUrl} alt={t(lang, "profile.avatarAlt")} class="h-24 w-24 rounded-full border border-border object-cover">
				<div class="min-w-0 flex-1 space-y-1">
					<ProfileNameEditor name={data.user.name ?? ""} {lang} />
					<p class="text-sm text-muted-foreground">{@html avatarSentence}</p>
				</div>
			</div>
		</Card.Content>
	</Card.Root>

	{#snippet methodStatus(on: boolean, text: string)}
		<span class="flex items-baseline gap-1.5 text-xs text-muted-foreground">
			<span class="size-1.5 shrink-0 translate-y-[-1px] rounded-full {on ? 'bg-success' : 'bg-foreground/25'}" aria-hidden="true"></span>
			<span class="min-w-0 break-words">{text}</span>
		</span>
	{/snippet}

	{#snippet autosaveNote(section: AutosaveSection)}
		<p class="flex min-h-5 shrink-0 items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
			{#if autosaveStatus[section] === "saving"}
				<LoaderCircle class="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />{t(lang, "profile.saving")}
			{:else if autosaveStatus[section] === "saved"}
				<Check class="size-3.5 text-success" aria-hidden="true" />{t(lang, "profile.saved")}
			{/if}
		</p>
	{/snippet}

	<Card.Root>
		<Card.Header class="flex items-start justify-between gap-4">
			<Card.Title>{t(lang, "profile.settings")}</Card.Title>
			{@render autosaveNote("settings")}
		</Card.Header>
		<Card.Content class="space-y-6">
			<form method="POST" action="?/updateProfile" onchange={autosave} use:enhance={enhanceAutosave("settings")}>
				<ChoiceGroup
					name="feedbackLanguagePreference"
					legend={t(lang, "profile.feedbackLanguage")}
					description={t(lang, "profile.feedbackHelp")}
					value={(form?.values?.feedbackLanguagePreference ?? data.user.feedbackLanguagePreference) === "target" ? "target" : "native"}
					items={FEEDBACK_PREFERENCES.map((preference) => ({
						value: preference,
						label: t(lang, preference === "native" ? "profile.feedbackNative" : "profile.feedbackTarget"),
					}))}
				/>
				{#if (form?.values?.feedbackLanguagePreference ?? data.user.feedbackLanguagePreference) !== "target" && !nativeLanguageInputValue}
					<p class="mt-2 text-xs text-warning">{t(lang, "profile.feedbackMissingNative")}</p>
				{/if}
			</form>

			<FormErrorFocus formRef={nativeLanguageForm} errors={form?.errors} fieldOrder={["nativeLanguage"]} />
			<form
				bind:this={nativeLanguageForm}
				method="POST"
				action="?/updateProfile"
				onchange={autosave}
				use:enhance={enhanceAutosave("settings")}
				class="space-y-2"
			>
				<Label for="nativeLanguage">{t(lang, "profile.nativeLanguage")}</Label>
				<Select
					id="nativeLanguage"
					name="nativeLanguage"
					bind:value={nativeLanguageInputValue}
					aria-invalid={Boolean(form?.errors?.nativeLanguage)}
					placeholder={t(lang, "profile.selectNativeLanguage")}
					items={[{ value: "", label: t(lang, "profile.selectNativeLanguage") }, ...nativeLanguageOptions]}
				/>
				{#if form?.errors?.nativeLanguage}
					<p data-field-error="nativeLanguage" class="field-error-message">{form.errors.nativeLanguage[0]}</p>
				{/if}
			</form>

			<FormErrorFocus formRef={proficiencyForm} errors={form?.proficiencyError ? { levelSelfAssign: [t(lang, "profile.proficiencyError")] } : null} />
			<form bind:this={proficiencyForm} method="POST" action="?/updateProficiency" onchange={autosave} use:enhance={enhanceAutosave("settings")}>
				<ChoiceGroup
					name="levelSelfAssign"
					columns={3}
					legend={t(lang, "profile.proficiency")}
					description={t(lang, "profile.proficiencyHelp")}
					value={data.levelSelfAssign == null ? "" : String(data.levelSelfAssign)}
					items={SELF_ASSIGNED_LEVELS.map((level) => ({ value: String(level), label: t(lang, difficultyLabelKey(level)), description: DIFFICULTY_CEFR[level] }))}
				/>
				{#if form?.proficiencyError}
					<p data-field-error="levelSelfAssign" class="field-error-message" role="alert">{t(lang, "profile.proficiencyError")}</p>
				{/if}
			</form>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header class="space-y-1">
			<Card.Title>{t(lang, "profile.loginMethods")}</Card.Title>
			<Card.Description>{t(lang, "profile.loginMethodsHelp")}</Card.Description>
		</Card.Header>
		<Card.Content class="space-y-3">
			<ModalDialog bind:open={emailDialogOpen} busy={emailChangePending} labelledby="email-dialog-title">
				{#if emailSentTo}
					<h2 id="email-dialog-title" class="mb-2">{t(lang, "profile.emailChangeSentTitle")}</h2>
					<p class="mb-3 break-all font-medium">{emailSentTo}</p>
					<p class="mb-3 text-sm leading-relaxed text-muted-foreground">{t(lang, "profile.emailChangeSent")}</p>
					<p class="mb-6 text-sm leading-relaxed text-muted-foreground">{t(lang, "profile.emailChangeUntil").replace("{email}", data.user.email)}</p>
					<div class="flex flex-wrap justify-end gap-2">
						<Button
							type="button"
							variant="ghost"
							onclick={async () => {
								emailSentTo = null;
								await tick();
								newEmailInput?.focus();
							}}
							>{t(lang, "profile.useDifferentEmail")}</Button
						>
						<Button type="button" bind:ref={emailDoneButton} onclick={() => (emailDialogOpen = false)}>{t(lang, "common.done")}</Button>
					</div>
				{:else}
					<h2 id="email-dialog-title" class="mb-2">{t(lang, "profile.changeEmail")}</h2>
					<p class="mb-6 text-sm leading-relaxed text-muted-foreground">{t(lang, "profile.changeEmailHelp")}</p>
					<form
						bind:this={emailChangeForm}
						method="POST"
						action="?/changeEmail"
						class="space-y-4"
						oninvalidcapture={handleInvalidField}
						use:enhance={({ formData }) => {
								emailChangePending = true;
								const address = String(formData.get("newEmail") ?? "").trim().toLowerCase();
								return async ({ result, update }) => {
									try {
										await update({ reset: result.type === "success" });
										if (result.type === "success" && result.data?.emailChange === "sent") {
											emailSentTo = address;
											// The submit button that held focus is gone with the form.
											await tick();
											emailDoneButton?.focus();
										}
									} finally {
										emailChangePending = false;
									}
								};
							}}
					>
						<div class="flex items-center gap-1.5">
							<Label for="newEmail">{t(lang, "profile.newEmail")}</Label>
							<InfoTip id="newEmail-providers" label={t(lang, "profile.emailProvidersLabel")} text={t(lang, "profile.emailProviders")} />
						</div>
						<Input
							id="newEmail"
							bind:ref={newEmailInput}
							data-initial-focus
							aria-describedby="newEmail-providers"
							name="newEmail"
							type="email"
							autocomplete="email"
							required
							readonly={emailChangePending}
							aria-invalid={form?.emailChange === "invalid" || form?.emailChange === "untrusted"}
						/>
						<FormErrorFocus
							formRef={emailChangeForm}
							errors={form?.emailChange === "invalid"
								? { newEmail: [t(lang, "profile.emailChangeInvalid")] }
								: form?.emailChange === "untrusted"
									? { newEmail: [t(lang, "profile.emailChangeUntrusted")] }
									: {}}
							fieldOrder={["newEmail"]}
						/>
						<!-- Mounted only while open, so visiting Profile never runs a challenge nobody asked for. -->
						{#if data.captchaSiteKey && emailDialogOpen}
							<Turnstile siteKey={data.captchaSiteKey} resetKey={form} />
						{/if}
						<div class="flex flex-wrap justify-end gap-2 pt-2">
							<Button type="button" variant="ghost" disabled={emailChangePending} onclick={() => (emailDialogOpen = false)}
								>{t(lang, "common.cancel")}</Button
							>
							<Button type="submit" disabled={emailChangePending}>
								{#if emailChangePending}
									<LoaderCircle class="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
								{/if}
								{t(lang, "profile.changeEmail")}
							</Button>
						</div>
						<!-- Field problems show on the field; only the rest needs a notice. -->
						<ActionNotification
							notification={form?.emailChange === "stale" || form?.emailChange === "captcha" || form?.emailChange === "error"
								? {
										variant: "error",
										title: t(lang, "profile.changeEmail"),
										message: t(lang, form.emailChange === "stale" ? "profile.emailChangeStale" : form.emailChange === "captcha" ? "profile.emailChangeCaptcha" : "profile.emailChangeError"),
									}
								: null}
						/>
					</form>
				{/if}
			</ModalDialog>
			{#if data.credentialConnected}
				<ModalDialog bind:open={passwordDialogOpen} busy={passwordChangePending} labelledby="password-dialog-title">
					<h2 id="password-dialog-title" class="mb-2">{t(lang, "profile.changePassword")}</h2>
					<p class="mb-6 text-sm leading-relaxed text-muted-foreground">{t(lang, "profile.changePasswordHelp")}</p>
					<form
						bind:this={passwordChangeForm}
						method="POST"
						action="?/changePassword"
						class="space-y-4"
						oninvalidcapture={handleInvalidField}
						use:enhance={async ({ formData, cancel }) => {
							localPasswordError = null;
							const newPassword = String(formData.get("newPassword") ?? "");
							if (newPassword !== formData.get("confirmNewPassword")) {
								localPasswordError = { field: "confirmNewPassword", message: t(lang, "profile.passwordMismatch") };
							} else if (newPassword.length > AUTH_PASSWORD_MAX_LENGTH) {
								localPasswordError = { field: "newPassword", message: t(lang, "profile.passwordTooLong") };
							} else {
								const strength = await checkPasswordStrength(newPassword, [data.user.name, data.user.email]).catch(() => null);
								if (strength && !strength.ok) localPasswordError = { field: "newPassword", message: passwordWarning(strength.warning) };
							}
							if (localPasswordError) {
								cancel();
								return;
							}
							passwordChangePending = true;
							return async ({ result, update }) => {
								try {
									await update({ reset: result.type === "success" });
									// Nothing is left to do in the dialog; the page confirms it instead.
									if (result.type === "success") passwordDialogOpen = false;
								} finally {
									passwordChangePending = false;
								}
							};
						}}
					>
						<!-- Tells password managers which account this is. -->
						<input type="text" name="username" autocomplete="username" value={data.user.email} hidden readonly>
						<div class="space-y-2">
							<Label for="currentPassword">{t(lang, "profile.currentPassword")}</Label>
							<Input
								id="currentPassword"
								name="currentPassword"
								type="password"
								autocomplete="current-password"
								data-initial-focus
								required
								readonly={passwordChangePending}
								aria-invalid={Boolean(passwordErrors.currentPassword)}
							/>
						</div>
						<div class="space-y-2">
							<Label for="newPassword">{t(lang, "profile.newPassword")}</Label>
							<Input
								id="newPassword"
								name="newPassword"
								type="password"
								autocomplete="new-password"
								minlength={AUTH_PASSWORD_MIN_LENGTH}
								required
								readonly={passwordChangePending}
								onfocus={preloadPasswordStrength}
								aria-invalid={Boolean(passwordErrors.newPassword)}
							/>
						</div>
						<div class="space-y-2">
							<Label for="confirmNewPassword">{t(lang, "profile.confirmNewPassword")}</Label>
							<Input
								id="confirmNewPassword"
								name="confirmNewPassword"
								type="password"
								autocomplete="new-password"
								required
								readonly={passwordChangePending}
								aria-invalid={Boolean(passwordErrors.confirmNewPassword)}
							/>
						</div>
						<FormErrorFocus
							formRef={passwordChangeForm}
							errors={passwordErrors}
							fieldOrder={["currentPassword", "newPassword", "confirmNewPassword"]}
						/>
						{#if data.captchaSiteKey && passwordDialogOpen}
							<Turnstile siteKey={data.captchaSiteKey} resetKey={form} />
						{/if}
						<div class="flex flex-wrap justify-end gap-2 pt-2">
							<Button type="button" variant="ghost" disabled={passwordChangePending} onclick={() => (passwordDialogOpen = false)}
								>{t(lang, "common.cancel")}</Button
							>
							<Button type="submit" disabled={passwordChangePending}>
								{#if passwordChangePending}
									<LoaderCircle class="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
								{/if}
								{t(lang, "profile.changePassword")}
							</Button>
						</div>
						<ActionNotification
							notification={form?.passwordChange === "captcha" || form?.passwordChange === "error"
								? {
										variant: "error",
										title: t(lang, "profile.changePassword"),
										message: t(lang, form.passwordChange === "captcha" ? "profile.emailChangeCaptcha" : "profile.passwordChangeError"),
									}
								: null}
						/>
					</form>
				</ModalDialog>
			{/if}
			<!-- Outside the dialog, which has closed by the time this shows. -->
			<ActionNotification
				notification={form?.passwordChange === "changed"
					? { variant: "success", title: t(lang, "profile.changePassword"), message: t(lang, "profile.passwordChanged") }
					: null}
			/>
			<ul class="-mx-6 -mb-6 divide-y divide-border border-t border-border">
				<li class="flex min-h-16 flex-wrap items-center gap-x-3 gap-y-2 px-6 py-3">
					<span class="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-foreground" aria-hidden="true">
						<KeyRound class="size-4" />
					</span>
					<!-- A real basis, not flex-1's zero, so the buttons wrap below before this column collapses. -->
					<span class="min-w-0 flex-1 basis-40 space-y-0.5">
						<span class="block truncate font-medium" title={data.user.email}>{data.user.email}</span>
						{@render methodStatus(data.credentialConnected, t(lang, data.credentialConnected ? "profile.passwordEnabled" : "profile.passwordMissing"))}
					</span>
					<span class="flex flex-wrap gap-2">
						{#if !data.credentialConnected}
							{#if form?.passwordSetupSent}
								<!-- The link is in their inbox and pressing again only sends a second one,
								     so the button stands down. It returns on the next load, in case the
								     mail never arrived. -->
								<span class="flex min-h-11 items-center text-xs font-medium text-muted-foreground">{t(lang, "profile.passwordSetupSent")}</span>
							{:else}
								<!-- Mails the reset link — which creates the missing credential row — to
								     the address on the session, so an account made through Google or
								     GitHub can add a password without retyping an address it may not
								     share with the provider. -->
								<form method="POST" action="?/sendPasswordSetup" use:enhance={enhancePasswordSetup}>
									<Button type="submit" variant="secondary" disabled={passwordSetupPending}>
										{#if passwordSetupPending}
											<LoaderCircle class="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
										{/if}
										{t(lang, "profile.setPassword")}
									</Button>
								</form>
							{/if}
						{/if}
						{#if data.credentialConnected}
							<Button type="button" variant="secondary" aria-haspopup="dialog" onclick={() => (passwordDialogOpen = true)}
								>{t(lang, "profile.changePassword")}</Button
							>
						{/if}
						<Button
							type="button"
							variant="secondary"
							aria-haspopup="dialog"
							onclick={() => {
								emailSentTo = null;
								emailDialogOpen = true;
							}}
							>{t(lang, "profile.changeEmail")}</Button
						>
					</span>
				</li>

				{#each data.socialLoginMethods as method}
					<li class="flex min-h-16 items-center gap-3 px-6 py-3">
						<span class="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted" aria-hidden="true">
							<SocialProviderIcon provider={method.id} />
						</span>
						<span class="min-w-0 flex-1 space-y-0.5">
							<span class="block font-medium">{method.label}</span>
							{@render methodStatus(
								method.connected,
								method.connectedAt
									? t(lang, "profile.connectedSince").replace("{date}", formatConnectedAt(method.connectedAt))
									: t(lang, method.configured ? "profile.notConnected" : "profile.unavailable"),
							)}
						</span>

						{#if method.connected}
							<!-- The button only asks; the dialog submits this form once the user
							     confirms, so an accidental tap cannot strip a login method. -->
							<form method="POST" action="?/unlinkSocialAccount" use:enhance={enhanceLoginMethod(method.id)} bind:this={disconnectForms[method.id]}>
								<input type="hidden" name="provider" value={method.id}>
								<Button
									type="button"
									variant="destructive"
									disabled={accountPending !== null || data.loginMethodCount <= 1}
									title={data.loginMethodCount <= 1 ? t(lang, "profile.lastMethodHelp") : undefined}
									aria-haspopup="dialog"
									onclick={() => askDisconnect(method.id)}
								>
									{#if accountPending === method.id}
										<LoaderCircle class="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
									{/if}
									{t(lang, "profile.disconnect")}
								</Button>
							</form>
						{:else if method.configured}
							<form method="POST" action="?/linkSocialAccount" use:enhance={enhanceLoginMethod(method.id)}>
								<input type="hidden" name="provider" value={method.id}>
								<Button type="submit" variant="secondary" disabled={accountPending !== null}>
									{#if accountPending === method.id}
										<LoaderCircle class="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
									{/if}
									{t(lang, "profile.connect")}
								</Button>
							</form>
						{/if}
					</li>
				{/each}
			</ul>

			<ConfirmDialog
				bind:open={confirmOpen}
				busy={accountPending !== null}
				title={t(lang, "profile.disconnectConfirmTitle").replace("{provider}", confirmingMethod?.label ?? "")}
				message={t(lang, "profile.disconnectConfirmMessage").replace(/\{provider\}/g, confirmingMethod?.label ?? "")}
				cancelLabel={t(lang, "common.cancel")}
				confirmLabel={t(lang, "profile.disconnect")}
				onconfirm={confirmDisconnect}
			/>
		</Card.Content>
	</Card.Root>

	<!-- The masthead's Trial pill links here. -->
	<section id="llm" class="scroll-mt-6 space-y-8">
		{#if !data.hasApiKey && data.trialQuota}
			<Card.Root>
				<Card.Header> <Card.Title>{t(lang, "profile.trialTitle")}</Card.Title> </Card.Header>
				<Card.Content class="space-y-3">
					<div class="flex items-center justify-between text-sm">
						<span class="text-muted-foreground">{t(lang, "profile.trialBalance")}</span>
						<span class="font-medium tabular-nums"
							>{trialPercent}% ({formatTokenCount(data.trialQuota.trialTokensLeft)}
							/ {formatTokenCount(data.trialQuota.trialTokensTotal)})</span
						>
					</div>
					<div class="h-2 overflow-hidden rounded-full bg-foreground/[0.08]">
						<div
							class="h-full rounded-full transition-[width] duration-250 ease-panel {trialTone === 'depleted' ? 'bg-destructive' : trialTone === 'low' ? 'bg-warning' : 'bg-primary'}"
							style="width: {trialPercent}%"
						></div>
					</div>
					{#if trialNextRelease}
						<p class="text-sm text-muted-foreground">
							{t(lang, "profile.trialReleaseSchedule")}
							{t(lang, "profile.trialNextRelease").replace("{date}", trialNextRelease)}
						</p>
					{/if}
				</Card.Content>
			</Card.Root>
		{/if}

		<Card.Root>
			<Card.Header class="flex items-start justify-between gap-4">
				<div class="min-w-0 space-y-1">
					<Card.Title>{t(lang, "profile.apiTitle")}</Card.Title>
					{#if data.hasApiKey}
						<p class="flex min-w-0 items-baseline gap-1.5 text-sm text-muted-foreground">
							<span class="size-1.5 shrink-0 translate-y-[-2px] rounded-full bg-success" aria-hidden="true"></span>
							<span class="min-w-0 break-words">{apiKeySummary}</span>
						</p>
					{/if}
				</div>
				{#if data.llmTraceSetting}
					{@render autosaveNote("llm")}
				{/if}
			</Card.Header>
			<Card.Content class="space-y-5">
				{#if !data.hasApiKey}
					{#if data.trialQuota && trialTone === "depleted"}
						<Notice tone="danger" role="status" title={t(lang, "profile.trialDepletedTitle")}>
							<p>
								{trialNextRelease ? t(lang, "profile.trialWaitingBody").replace("{date}", trialNextRelease) : t(lang, "profile.trialDepletedBody")}
							</p>
						</Notice>
					{:else if data.trialQuota && trialTone === "low"}
						<Notice tone="warning" role="status" title={t(lang, "profile.trialLowTitle")}><p>{t(lang, "profile.trialLowBody")}</p></Notice>
					{/if}
					<div class="space-y-2">
						<p class="text-sm text-muted-foreground">{t(lang, "profile.apiNotConfigured")}</p>
						<div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
							{#each BYOK_API_PRESETS as preset, index (preset.id)}
								{@const label = t(lang, preset.id === "deepseek" ? "profile.apiPresetDeepseek" : "profile.apiPresetOpenrouter")}
								{#if index > 0}
									<span>{t(lang, "profile.apiPresetOr")}</span>
								{/if}
								<span class="inline-flex items-center">
									<Button
										type="button"
										variant="secondary"
										title={t(lang, "profile.apiPresetFill").replace("{provider}", label)}
										onclick={() => applyApiPreset(preset)}
									>
										{label}
									</Button>
									<Button
										href={preset.keyUrl}
										target="_blank"
										rel="noopener noreferrer"
										variant="ghost"
										size="icon"
										aria-label={t(lang, "profile.apiPresetGetKey").replace("{provider}", label)}
										title={t(lang, "profile.apiPresetGetKey").replace("{provider}", label)}
									>
										<ExternalLink aria-hidden="true" />
									</Button>
								</span>
							{/each}
						</div>
					</div>
				{/if}

				<FormErrorFocus formRef={apiKeyForm} errors={form?.errors} fieldOrder={["apiKey", "apiBaseUrl", "apiModel"]} />
				<form
					bind:this={apiKeyForm}
					method="POST"
					action="?/updateProfile"
					oninvalidcapture={handleInvalidField}
					use:enhance={() => {
					showActionNotification = true;
					return async ({ update }) => {
						await update({ reset: false });
					};
				}}
					class="space-y-4"
				>
					<div class="space-y-2">
						<Label for="apiBaseUrl">{t(lang, "profile.apiProvider")}</Label>
						<Select
							id="apiBaseUrl"
							name="apiBaseUrl"
							bind:value={apiBaseUrlValue}
							onValueChange={() => { apiKeyValue = ""; }}
							placeholder={t(lang, "profile.selectApiProvider")}
							items={BYOK_API_BASE_URLS.map((baseUrl) => ({ value: baseUrl, label: BYOK_API_BASE_URL_LABELS[baseUrl] }))}
							aria-invalid={Boolean(form?.errors?.apiBaseUrl)}
							aria-describedby={apiBaseUrlValue ? "api-base-url" : undefined}
						/>
						{#if apiBaseUrlValue}
							<p id="api-base-url" class="text-xs text-muted-foreground">
								{t(lang, "profile.baseUrl")}: <span class="font-mono">{apiBaseUrlValue}</span>
							</p>
						{/if}
						{#if form?.errors?.apiBaseUrl}
							<p data-field-error="apiBaseUrl" class="field-error-message">{form.errors.apiBaseUrl[0]}</p>
						{/if}
					</div>
					<div class="space-y-2">
						<Label for="apiKey">{t(lang, "profile.apiKey")}</Label>
						<Input
							id="apiKey"
							name="apiKey"
							bind:ref={apiKeyInput}
							type="password"
							autocomplete="off"
							bind:value={apiKeyValue}
							placeholder={canRetainApiKey ? t(lang, "profile.apiKeyKeepPlaceholder") : t(lang, "profile.apiKeyPlaceholder")}
							aria-invalid={Boolean(form?.errors?.apiKey)}
						/>
						{#if form?.errors?.apiKey}
							<p data-field-error="apiKey" class="field-error-message">{form.errors.apiKey[0]}</p>
						{/if}
					</div>
					<div class="space-y-2">
						<Label for="apiModel">{t(lang, "profile.model")}</Label>
						<Input
							id="apiModel"
							name="apiModel"
							bind:value={apiModelValue}
							placeholder={apiModelPlaceholder}
							aria-invalid={Boolean(form?.errors?.apiModel)}
						/>
						{#if form?.errors?.apiModel}
							<p data-field-error="apiModel" class="field-error-message">{form.errors.apiModel[0]}</p>
						{/if}
					</div>
					{#if hasAddresseeBeta(apiBaseUrlValue)}
						<!-- Fixed by Libiamo, so it reads as a fact rather than a field. -->
						<div class="space-y-1 rounded-lg bg-foreground/[0.04] px-3.5 py-3">
							<p class="flex flex-wrap items-center gap-2 text-sm">
								<span class="font-medium">{t(lang, "profile.addresseeModel")}</span>
								<Badge variant="outline">{t(lang, "profile.beta")}</Badge>
								<span class="font-mono text-xs text-muted-foreground">{ADDRESSEE_BETA_MODEL}</span>
							</p>
							<p class="text-xs leading-relaxed text-muted-foreground">{t(lang, "profile.addresseeModelHelp")}</p>
						</div>
					{/if}
					<div class="flex flex-col gap-2 pt-1 sm:flex-row sm:flex-wrap sm:items-center">
						<Button type="submit">{data.hasApiKey ? t(lang, "profile.updateApiKey") : t(lang, "profile.saveApiKey")}</Button>
						{#if data.hasApiKey}
							<Button type="button" variant="destructive" aria-haspopup="dialog" onclick={() => (removeApiKeyOpen = true)}
								>{t(lang, "profile.removeApiKey")}</Button
							>
						{/if}
					</div>
				</form>
				{#if data.hasApiKey}
					<form
						bind:this={removeApiKeyForm}
						method="POST"
						action="?/clearApiKey"
						use:enhance={() => {
							removeApiKeyPending = true;
							showActionNotification = true;
							return async ({ update }) => {
								await update({ reset: false });
								removeApiKeyPending = false;
								removeApiKeyOpen = false;
							};
						}}
					></form>
					<ConfirmDialog
						bind:open={removeApiKeyOpen}
						busy={removeApiKeyPending}
						title={t(lang, "profile.removeApiKeyConfirmTitle")}
						message={t(lang, "profile.removeApiKeyConfirmMessage")}
						cancelLabel={t(lang, "common.cancel")}
						confirmLabel={t(lang, "profile.removeApiKey")}
						onconfirm={() => removeApiKeyForm?.requestSubmit()}
					/>
				{/if}

				{#if data.llmTraceSetting}
					<form
						method="POST"
						action="?/updateLlmTraceCapture"
						onchange={autosave}
						use:enhance={enhanceAutosave("llm")}
						class="border-t border-border pt-5"
					>
						<div class="flex min-h-11 items-start justify-between gap-4">
							<span class="space-y-1">
								<label for="llm-trace-capture" class="block text-sm font-medium">{t(lang, "profile.llmTraceCapture")}</label>
								<span id="llm-trace-capture-help" class="block text-xs leading-relaxed text-muted-foreground"
									>{t(lang, "profile.llmTraceCaptureHelp")}</span
								>
							</span>
							<Switch
								id="llm-trace-capture"
								name="llmTraceCapture"
								class="mt-0.5"
								checked={data.llmTraceSetting.enabled}
								aria-describedby="llm-trace-capture-help"
							/>
						</div>
					</form>
				{/if}
			</Card.Content>
		</Card.Root>
	</section>

	<Separator />

	<div class="flex flex-wrap items-center gap-x-5 gap-y-3">
		<nav aria-label={t(lang, "profile.linksLabel")} class="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted-foreground">
			<a
				class="inline-flex min-h-11 items-center rounded-sm underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
				href="{base}/welcome"
			>
				{t(lang, "profile.linkHomepage")}
			</a>
			<a
				class="inline-flex min-h-11 items-center rounded-sm underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
				href="{base}/terms"
			>
				{t(lang, "profile.linkTerms")}
			</a>
			<a
				class="inline-flex min-h-11 items-center rounded-sm underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
				href="{base}/privacy"
			>
				{t(lang, "profile.linkPrivacy")}
			</a>
			<a
				class="inline-flex min-h-11 items-center rounded-sm underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
				href="{base}/changelog"
			>
				{t(lang, "profile.linkChangelog")}
			</a>
		</nav>

		<form method="POST" action="?/signOut" class="ml-auto" use:enhance>
			<Button type="submit" variant="secondary">{t(lang, "nav.signOut")}</Button>
		</form>
	</div>
</div>
