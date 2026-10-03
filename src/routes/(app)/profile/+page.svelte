<script lang="ts">
import Check from "@lucide/svelte/icons/check";
import ExternalLink from "@lucide/svelte/icons/external-link";
import KeyRound from "@lucide/svelte/icons/key-round";
import LoaderCircle from "@lucide/svelte/icons/loader-circle";
import { onDestroy, onMount } from "svelte";
import { enhance } from "$app/forms";
import { afterNavigate, replaceState } from "$app/navigation";
import { base } from "$app/paths";
import type { AccountActionResult, SocialAuthFailure, SocialProviderId } from "$lib/auth/social";
import { handleInvalidField } from "$lib/client/form-attention";
import ProfileNameEditor from "$lib/components/account/ProfileNameEditor.svelte";
import SocialProviderIcon from "$lib/components/auth/SocialProviderIcon.svelte";
import ActionNotification from "$lib/components/common/ActionNotification.svelte";
import ConfirmDialog from "$lib/components/common/ConfirmDialog.svelte";
import FormErrorFocus from "$lib/components/common/FormErrorFocus.svelte";
import ModalDialog from "$lib/components/common/ModalDialog.svelte";
import { Badge } from "$lib/components/ui/badge";
import { Button } from "$lib/components/ui/button";
import * as Card from "$lib/components/ui/card";
import { Input } from "$lib/components/ui/input";
import { Label } from "$lib/components/ui/label";
import { Separator } from "$lib/components/ui/separator";
import type { LanguageCode } from "$lib/constants";
import {
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

/*
 * One visual language for the whole page. Fields and choices are white with a border (you type or
 * pick in them); buttons are filled (dark primary, tinted secondary) or, when they undo something,
 * red text. The page's beige is only ever background, never a control.
 */
const fieldClass =
	"h-11 w-full rounded-lg border border-input bg-white/80 px-3 text-sm text-foreground shadow-none transition-colors placeholder:text-muted-foreground hover:border-foreground/25 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 motion-reduce:transition-none";
const choiceClass =
	"group flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-input bg-white/80 px-3 py-2.5 transition-colors hover:border-foreground/30 has-[:checked]:border-foreground/55 has-[:checked]:bg-white has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50 motion-reduce:transition-none";
const radioDotClass =
	"mt-0.5 size-4 shrink-0 rounded-full border-2 border-foreground/35 bg-white transition-[border] group-has-[:checked]:border-[5px] group-has-[:checked]:border-foreground motion-reduce:transition-none";
const FEEDBACK_PREFERENCES = ["native", "target"] as const;
const actionClass = "min-h-11 shrink-0 rounded-lg px-4";
const dangerClass = `${actionClass} text-destructive hover:bg-destructive/10 hover:text-destructive`;

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

let trialPercent = $derived(
	data.trialQuota ? Math.max(0, Math.min(100, Math.round((data.trialQuota.trialTokensLeft / data.trialQuota.trialTokensTotal) * 100))) : 0,
);
let trialTone = $derived(!data.trialQuota ? "normal" : data.trialQuota.trialTokensLeft <= 0 ? "depleted" : trialPercent <= 10 ? "low" : "normal");

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
				<img src={data.avatarUrl} alt={t(lang, "profile.avatarAlt")} class="h-24 w-24 rounded-full border border-gray-200 object-cover shadow-sm">
				<div class="min-w-0 flex-1 space-y-1">
					<ProfileNameEditor name={data.user.name ?? ""} {lang} />
					<p class="text-sm text-muted-foreground">{@html avatarSentence}</p>
				</div>
			</div>
		</Card.Content>
	</Card.Root>

	{#snippet methodStatus(on: boolean, text: string)}
		<span class="flex items-baseline gap-1.5 text-xs text-muted-foreground">
			<span class="size-1.5 shrink-0 translate-y-[-1px] rounded-full {on ? 'bg-emerald-600' : 'bg-foreground/25'}" aria-hidden="true"></span>
			<span class="min-w-0 break-words">{text}</span>
		</span>
	{/snippet}

	{#snippet autosaveNote(section: AutosaveSection)}
		<p class="flex min-h-5 shrink-0 items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
			{#if autosaveStatus[section] === "saving"}
				<LoaderCircle class="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />{t(lang, "profile.saving")}
			{:else if autosaveStatus[section] === "saved"}
				<Check class="size-3.5 text-emerald-700" aria-hidden="true" />{t(lang, "profile.saved")}
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
				<fieldset class="space-y-2" aria-describedby="feedback-help">
					<legend class="mb-2 text-sm font-medium">{t(lang, "profile.feedbackLanguage")}</legend>
					<div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
						{#each FEEDBACK_PREFERENCES as preference}
							<label class={choiceClass}>
								<input
									class="sr-only"
									type="radio"
									name="feedbackLanguagePreference"
									value={preference}
									checked={((form?.values?.feedbackLanguagePreference ?? data.user.feedbackLanguagePreference) === "target") ===
										(preference === "target")}
								>
								<span class={radioDotClass} aria-hidden="true"></span>
								<span class="text-sm font-medium">{t(lang, preference === "native" ? "profile.feedbackNative" : "profile.feedbackTarget")}</span>
							</label>
						{/each}
					</div>
					<p id="feedback-help" class="text-xs text-muted-foreground">{t(lang, "profile.feedbackHelp")}</p>
					{#if (form?.values?.feedbackLanguagePreference ?? data.user.feedbackLanguagePreference) !== "target" && !nativeLanguageInputValue}
						<p class="text-xs text-amber-800">{t(lang, "profile.feedbackMissingNative")}</p>
					{/if}
				</fieldset>
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
				<select
					id="nativeLanguage"
					name="nativeLanguage"
					bind:value={nativeLanguageInputValue}
					aria-invalid={Boolean(form?.errors?.nativeLanguage)}
					class={fieldClass}
				>
					<option value="">{t(lang, "profile.selectNativeLanguage")}</option>
					{#each nativeLanguageOptions as language}
						<option value={language.value}>{language.label}</option>
					{/each}
				</select>
				{#if form?.errors?.nativeLanguage}
					<p data-field-error="nativeLanguage" class="text-sm text-destructive">{form.errors.nativeLanguage[0]}</p>
				{/if}
			</form>

			<FormErrorFocus formRef={proficiencyForm} errors={form?.proficiencyError ? { levelSelfAssign: [t(lang, "profile.proficiencyError")] } : null} />
			<form bind:this={proficiencyForm} method="POST" action="?/updateProficiency" onchange={autosave} use:enhance={enhanceAutosave("settings")}>
				<fieldset class="space-y-2" aria-describedby="proficiency-help">
					<legend class="mb-2 text-sm font-medium">{t(lang, "profile.proficiency")}</legend>
					<div class="grid grid-cols-1 gap-2 sm:grid-cols-3">
						{#each SELF_ASSIGNED_LEVELS as level}
							<label class={choiceClass}>
								<input class="sr-only" type="radio" name="levelSelfAssign" value={level} checked={data.levelSelfAssign === level}>
								<span class={radioDotClass} aria-hidden="true"></span>
								<span class="flex flex-col">
									<span class="text-sm font-medium">{t(lang, difficultyLabelKey(level))}</span>
									<span class="text-sm text-muted-foreground">{DIFFICULTY_CEFR[level]}</span>
								</span>
							</label>
						{/each}
					</div>
					<p id="proficiency-help" class="text-xs leading-relaxed text-muted-foreground">{t(lang, "profile.proficiencyHelp")}</p>
					{#if form?.proficiencyError}
						<p data-field-error="levelSelfAssign" class="text-sm text-destructive" role="alert">{t(lang, "profile.proficiencyError")}</p>
					{/if}
				</fieldset>
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
				<h2 id="email-dialog-title" class="mb-2 font-serif text-2xl font-medium">{t(lang, "profile.changeEmail")}</h2>
				<p class="mb-6 text-sm leading-relaxed text-muted-foreground">{t(lang, "profile.changeEmailHelp")}</p>
				<form
					bind:this={emailChangeForm}
					method="POST"
					action="?/changeEmail"
					class="space-y-4"
					oninvalidcapture={handleInvalidField}
					use:enhance={() => {
							emailChangePending = true;
							return async ({ update }) => {
								try { await update({ reset: false }); } finally { emailChangePending = false; }
							};
						}}
				>
					<Label for="newEmail">{t(lang, "profile.newEmail")}</Label>
					<Input
						id="newEmail"
						class="min-h-12 rounded-xl bg-background px-3 shadow-none"
						name="newEmail"
						type="email"
						autocomplete="email"
						required
						readonly={emailChangePending}
						aria-invalid={form?.emailChange === "invalid"}
					/>
					<FormErrorFocus
						formRef={emailChangeForm}
						errors={form?.emailChange === "invalid" ? { newEmail: [t(lang, "profile.emailChangeInvalid")] } : {}}
						fieldOrder={["newEmail"]}
					/>
					<div class="flex flex-wrap justify-end gap-2 pt-2">
						<Button type="button" variant="ghost" class={actionClass} disabled={emailChangePending} onclick={() => (emailDialogOpen = false)}
							>{t(lang, "common.cancel")}</Button
						>
						<Button type="submit" class={actionClass} disabled={emailChangePending}>
							{#if emailChangePending}
								<LoaderCircle class="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
							{/if}
							{t(lang, "profile.changeEmail")}
						</Button>
					</div>
					<ActionNotification
						notification={form?.emailChange ? {
							variant: form.emailChange === "sent" ? "success" : "error",
							title: t(lang, "profile.changeEmail"),
							message: t(lang, form.emailChange === "sent" ? "profile.emailChangeSent" : form.emailChange === "stale" ? "profile.emailChangeStale" : form.emailChange === "invalid" ? "profile.emailChangeInvalid" : "profile.emailChangeError"),
						} : null}
					/>
				</form>
			</ModalDialog>
			<ul class="divide-y divide-border overflow-hidden rounded-lg border border-border bg-white/50">
				<li class="flex min-h-16 flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
					<span class="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-foreground" aria-hidden="true">
						<KeyRound class="size-4" />
					</span>
					<span class="min-w-0 flex-1 space-y-0.5">
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
									<Button type="submit" variant="secondary" class={actionClass} disabled={passwordSetupPending}>
										{#if passwordSetupPending}
											<LoaderCircle class="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
										{/if}
										{t(lang, "profile.setPassword")}
									</Button>
								</form>
							{/if}
						{/if}
						<Button type="button" variant="secondary" class={actionClass} aria-haspopup="dialog" onclick={() => (emailDialogOpen = true)}
							>{t(lang, "profile.changeEmail")}</Button
						>
					</span>
				</li>

				{#each data.socialLoginMethods as method}
					<li class="flex min-h-16 items-center gap-3 px-4 py-3">
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
									variant="ghost"
									class={dangerClass}
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
								<Button type="submit" variant="secondary" class={actionClass} disabled={accountPending !== null}>
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
					<div class="h-3 overflow-hidden rounded-full bg-secondary">
						<div
							class="h-full rounded-full transition-all {trialTone === 'depleted' ? 'bg-red-500' : trialTone === 'low' ? 'bg-amber-500' : 'bg-primary'}"
							style="width: {trialPercent}%"
						></div>
					</div>
				</Card.Content>
			</Card.Root>
		{/if}

		<Card.Root>
			<Card.Header class="flex items-start justify-between gap-4">
				<div class="min-w-0 space-y-1">
					<Card.Title>{t(lang, "profile.apiTitle")}</Card.Title>
					{#if data.hasApiKey}
						<p class="flex min-w-0 items-baseline gap-1.5 text-sm text-muted-foreground">
							<span class="size-1.5 shrink-0 translate-y-[-2px] rounded-full bg-emerald-600" aria-hidden="true"></span>
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
						<div class="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="status">
							<p class="font-semibold">{t(lang, "profile.trialDepletedTitle")}</p>
							<p class="mt-1">{t(lang, "profile.trialDepletedBody")}</p>
						</div>
					{:else if data.trialQuota && trialTone === "low"}
						<div class="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="status">
							<p class="font-semibold">{t(lang, "profile.trialLowTitle")}</p>
							<p class="mt-1">{t(lang, "profile.trialLowBody")}</p>
						</div>
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
										class={actionClass}
										title={t(lang, "profile.apiPresetFill").replace("{provider}", label)}
										onclick={() => applyApiPreset(preset)}
									>
										{label}
									</Button>
									<a
										href={preset.keyUrl}
										target="_blank"
										rel="noopener noreferrer"
										class="inline-flex size-11 items-center justify-center rounded-lg transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
										aria-label={t(lang, "profile.apiPresetGetKey").replace("{provider}", label)}
										title={t(lang, "profile.apiPresetGetKey").replace("{provider}", label)}
									>
										<ExternalLink class="size-4" aria-hidden="true" />
									</a>
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
						<select
							id="apiBaseUrl"
							name="apiBaseUrl"
							bind:value={apiBaseUrlValue}
							onchange={() => { apiKeyValue = ""; }}
							class={fieldClass}
							aria-invalid={Boolean(form?.errors?.apiBaseUrl)}
							aria-describedby={apiBaseUrlValue ? "api-base-url" : undefined}
						>
							<option value="" disabled>{t(lang, "profile.selectApiProvider")}</option>
							{#each BYOK_API_BASE_URLS as baseUrl}
								<option value={baseUrl}>{BYOK_API_BASE_URL_LABELS[baseUrl]}</option>
							{/each}
						</select>
						{#if apiBaseUrlValue}
							<p id="api-base-url" class="text-xs text-muted-foreground">
								{t(lang, "profile.baseUrl")}: <span class="font-mono">{apiBaseUrlValue}</span>
							</p>
						{/if}
						{#if form?.errors?.apiBaseUrl}
							<p data-field-error="apiBaseUrl" class="text-sm text-destructive">{form.errors.apiBaseUrl[0]}</p>
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
							class={fieldClass}
							placeholder={canRetainApiKey ? t(lang, "profile.apiKeyKeepPlaceholder") : t(lang, "profile.apiKeyPlaceholder")}
							aria-invalid={Boolean(form?.errors?.apiKey)}
						/>
						{#if form?.errors?.apiKey}
							<p data-field-error="apiKey" class="text-sm text-destructive">{form.errors.apiKey[0]}</p>
						{/if}
					</div>
					<div class="space-y-2">
						<Label for="apiModel">{t(lang, "profile.model")}</Label>
						<Input
							id="apiModel"
							name="apiModel"
							bind:value={apiModelValue}
							class={fieldClass}
							placeholder={apiModelPlaceholder}
							aria-invalid={Boolean(form?.errors?.apiModel)}
						/>
						{#if form?.errors?.apiModel}
							<p data-field-error="apiModel" class="text-sm text-destructive">{form.errors.apiModel[0]}</p>
						{/if}
					</div>
					{#if hasAddresseeBeta(apiBaseUrlValue)}
						<!-- Fixed by Libiamo, so it reads as a fact rather than a field. -->
						<div class="space-y-1 rounded-lg bg-muted/60 px-3 py-2.5">
							<p class="flex flex-wrap items-center gap-2 text-sm">
								<span class="font-medium">{t(lang, "profile.addresseeModel")}</span>
								<Badge variant="outline" class="bg-white/70">{t(lang, "profile.beta")}</Badge>
								<span class="font-mono text-xs text-muted-foreground">{ADDRESSEE_BETA_MODEL}</span>
							</p>
							<p class="text-xs leading-relaxed text-muted-foreground">{t(lang, "profile.addresseeModelHelp")}</p>
						</div>
					{/if}
					<div class="flex flex-col gap-2 pt-1 sm:flex-row sm:flex-wrap sm:items-center">
						<Button type="submit" class={actionClass}>{data.hasApiKey ? t(lang, "profile.updateApiKey") : t(lang, "profile.saveApiKey")}</Button>
						{#if data.hasApiKey}
							<Button type="button" variant="ghost" class={dangerClass} aria-haspopup="dialog" onclick={() => (removeApiKeyOpen = true)}
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
						<label class="flex min-h-11 cursor-pointer items-start gap-3">
							<input
								type="checkbox"
								name="llmTraceCapture"
								class="mt-0.5 size-5 shrink-0 accent-foreground"
								checked={data.llmTraceSetting.enabled}
								aria-describedby="llm-trace-capture-help"
							>
							<span class="space-y-1">
								<span class="block text-sm font-medium">{t(lang, "profile.llmTraceCapture")}</span>
								<span id="llm-trace-capture-help" class="block text-xs leading-relaxed text-muted-foreground"
									>{t(lang, "profile.llmTraceCaptureHelp")}</span
								>
							</span>
						</label>
					</form>
				{/if}
			</Card.Content>
		</Card.Root>
	</section>

	<Separator />

	<div class="flex flex-wrap items-center gap-x-5 gap-y-3">
		<nav aria-label={t(lang, "profile.linksLabel")} class="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted-foreground">
			<a
				class="inline-flex min-h-11 items-center rounded-sm underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring"
				href="{base}/welcome"
			>
				{t(lang, "profile.linkHomepage")}
			</a>
			<a
				class="inline-flex min-h-11 items-center rounded-sm underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring"
				href="{base}/terms"
			>
				{t(lang, "profile.linkTerms")}
			</a>
			<a
				class="inline-flex min-h-11 items-center rounded-sm underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring"
				href="{base}/privacy"
			>
				{t(lang, "profile.linkPrivacy")}
			</a>
			<a
				class="inline-flex min-h-11 items-center rounded-sm underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring"
				href="{base}/changelog"
			>
				{t(lang, "profile.linkChangelog")}
			</a>
		</nav>

		<form method="POST" action="?/signOut" class="ml-auto" use:enhance>
			<Button type="submit" variant="secondary" class={actionClass}>{t(lang, "nav.signOut")}</Button>
		</form>
	</div>
</div>
