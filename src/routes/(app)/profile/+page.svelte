<script lang="ts">
import { onMount } from "svelte";
import { enhance } from "$app/forms";
import { handleInvalidField } from "$lib/client/form-attention";
import { clearQuestHallReturnContext } from "$lib/client/quest-hall/return-context";
import ActionNotification from "$lib/components/ActionNotification.svelte";
import FormErrorFocus from "$lib/components/FormErrorFocus.svelte";
import ProfileNameEditor from "$lib/components/ProfileNameEditor.svelte";
import { Button } from "$lib/components/ui/button";
import * as Card from "$lib/components/ui/card";
import { Input } from "$lib/components/ui/input";
import { Label } from "$lib/components/ui/label";
import { Separator } from "$lib/components/ui/separator";
import type { LanguageCode } from "$lib/constants";
import { BYOK_API_BASE_URL_LABELS, BYOK_API_BASE_URLS, getNativeLanguageOptions, SELF_ASSIGNED_LEVELS } from "$lib/constants";
import { t } from "$lib/i18n";

let { form, data } = $props();
let lang = $derived(data.user.activeLanguage as LanguageCode);

const localeByLanguage = {
	en: "en-US",
	es: "es-ES",
	fr: "fr-FR",
	ja: "ja-JP",
} as const;

let localizedNativeLanguageOptions = $state<{ value: string; label: string }[]>([]);

const nativeLanguageOptions = $derived(
	localizedNativeLanguageOptions.length > 0 ? localizedNativeLanguageOptions : (data.serverNativeLanguages ?? []),
);

let nativeLanguageInputValue = $state("");
let apiBaseUrlValue = $state("");
let apiModelValue = $state("");
let apiKeyForm: HTMLFormElement | null = $state(null);
let showActionNotification = $state(false);

const actionNotification = $derived(
	showActionNotification && form?.success
		? { variant: "success" as const, title: t(lang, "profile.updatedTitle"), message: t(lang, "profile.updatedMessage") }
		: showActionNotification && form?.message
			? { variant: "error" as const, title: t(lang, "profile.unableSave"), message: form.message }
			: null,
);

let trialPercent = $derived(
	data.trialQuota ? Math.max(0, Math.min(100, Math.round((data.trialQuota.trialTokensLeft / data.trialQuota.trialTokensTotal) * 100))) : 0,
);
let trialTone = $derived(!data.trialQuota ? "normal" : data.trialQuota.trialTokensLeft <= 0 ? "depleted" : trialPercent <= 10 ? "low" : "normal");

function formatTokenCount(value: number) {
	return new Intl.NumberFormat("en-US").format(Math.max(0, value));
}

$effect(() => {
	nativeLanguageInputValue = form?.values?.nativeLanguage ?? data.user.nativeLanguage ?? "";
});

$effect(() => {
	apiBaseUrlValue = form?.values?.apiBaseUrl ?? data.apiBaseUrl ?? "";
});

$effect(() => {
	apiModelValue = form?.values?.apiModel ?? data.apiModel ?? "";
});

onMount(() => {
	const lang = localeByLanguage[data.user.activeLanguage as keyof typeof localeByLanguage] ?? "en-US";
	localizedNativeLanguageOptions = getNativeLanguageOptions(lang);
});

function autosave(event: Event) {
	(event.currentTarget as HTMLFormElement).requestSubmit();
}

function enhanceSilently() {
	showActionNotification = false;
	return async ({ update }: { update: (options?: { reset?: boolean }) => Promise<void> }) => {
		await update({ reset: false });
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
					<p class="text-sm text-muted-foreground">
						{t(lang, "profile.avatarConnectedBefore")}
						<a href="https://gravatar.com" target="_blank" rel="noopener noreferrer" class="font-medium text-primary hover:underline">Gravatar</a>
						{t(lang, "profile.avatarConnectedAfter")}
					</p>
					<p class="text-xs text-muted-foreground">{t(lang, "profile.avatarHint")}</p>
				</div>
			</div>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header><Card.Title>{t(lang, "profile.settings")}</Card.Title></Card.Header>
		<Card.Content class="space-y-4">
			<form method="POST" action="?/updateProfile" onchange={autosave} use:enhance={enhanceSilently}>
				<fieldset class="space-y-2">
					<legend class="text-sm font-medium">{t(lang, "profile.feedbackLanguage")}</legend>
					<div class="feedback-tabs" role="radiogroup">
						<label>
							<input
								class="sr-only"
								type="radio"
								name="feedbackLanguagePreference"
								value="native"
								checked={(form?.values?.feedbackLanguagePreference ?? data.user.feedbackLanguagePreference) !== "target"}
							>
							{t(lang, "profile.feedbackNative")}
						</label>
						<label>
							<input
								class="sr-only"
								type="radio"
								name="feedbackLanguagePreference"
								value="target"
								checked={(form?.values?.feedbackLanguagePreference ?? data.user.feedbackLanguagePreference) === "target"}
							>
							{t(lang, "profile.feedbackTarget")}
						</label>
					</div>
					<p class="text-xs text-muted-foreground">{t(lang, "profile.feedbackHelp")}</p>
					{#if (form?.values?.feedbackLanguagePreference ?? data.user.feedbackLanguagePreference) !== "target" && !nativeLanguageInputValue}
						<p class="text-xs text-amber-700">{t(lang, "profile.feedbackMissingNative")}</p>
					{/if}
				</fieldset>
			</form>

			<form method="POST" action="?/updateProfile" onchange={autosave} use:enhance={enhanceSilently} class="space-y-2">
				<Label for="nativeLanguage">{t(lang, "profile.nativeLanguage")}</Label>
				<select
					id="nativeLanguage"
					name="nativeLanguage"
					bind:value={nativeLanguageInputValue}
					aria-invalid={Boolean(form?.errors?.nativeLanguage)}
					class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20"
				>
					<option value="">{t(lang, "profile.selectNativeLanguage")}</option>
					{#each nativeLanguageOptions as language}
						<option value={language.value}>{language.label}</option>
					{/each}
				</select>
				{#if form?.errors?.nativeLanguage}
					<p class="text-sm text-red-600">{form.errors.nativeLanguage[0]}</p>
				{/if}
			</form>

			<form method="POST" action="?/updateProficiency" onchange={autosave} use:enhance={enhanceSilently}>
				<fieldset class="space-y-2" aria-describedby="proficiency-help">
					<legend class="text-sm font-medium">{t(lang, "profile.proficiency")}</legend>
					<div class="grid grid-cols-1 gap-2 sm:grid-cols-3" role="radiogroup">
						{#each SELF_ASSIGNED_LEVELS as level}
							<label
								class="flex min-h-11 cursor-pointer flex-col justify-center rounded-lg border border-border bg-background px-3 py-2 text-center transition-colors hover:bg-secondary/60 has-[:checked]:border-foreground/35 has-[:checked]:bg-secondary has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2"
							>
								<input class="sr-only" type="radio" name="levelSelfAssign" value={level} checked={data.levelSelfAssign === level}>
								<span class="text-xs font-semibold uppercase tracking-wider">{t(lang, `profile.proficiency.level${level}`)}</span>
								<span class="mt-0.5 text-sm text-muted-foreground">{t(lang, `profile.proficiency.range${level}`)}</span>
							</label>
						{/each}
					</div>
					<p id="proficiency-help" class="text-xs leading-relaxed text-muted-foreground">{t(lang, "profile.proficiencyHelp")}</p>
					{#if form?.proficiencyError}
						<p class="text-sm text-red-600" role="alert">{t(lang, "profile.proficiencyError")}</p>
					{/if}
				</fieldset>
			</form>
		</Card.Content>
	</Card.Root>

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
		<Card.Header> <Card.Title>{t(lang, "profile.apiTitle")}</Card.Title> </Card.Header>
		<Card.Content>
			{#if data.hasApiKey}
				<p class="mb-4 text-sm text-green-700">&#x2705; {t(lang, "profile.apiConfigured")}</p>
			{:else}
				<p class="mb-4 text-sm text-muted-foreground">
					{t(lang, "profile.apiNotConfiguredBefore")}
					<a href="https://platform.deepseek.com" target="_blank" rel="noopener noreferrer" class="underline hover:text-foreground underline-offset-2"
						>DeepSeek Platform</a
					>
					{t(lang, "profile.apiNotConfiguredAfter")}
				</p>
				{#if data.trialQuota && trialTone === "depleted"}
					<div class="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
						<p class="font-semibold">{t(lang, "profile.trialDepletedTitle")}</p>
						<p class="mt-1">{t(lang, "profile.trialDepletedBody")}</p>
					</div>
				{:else if data.trialQuota && trialTone === "low"}
					<div class="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
						<p class="font-semibold">{t(lang, "profile.trialLowTitle")}</p>
						<p class="mt-1">{t(lang, "profile.trialLowBody")}</p>
					</div>
				{/if}
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
				class="space-y-3"
			>
				<div class="space-y-2">
					<Label for="apiKey">{t(lang, "profile.apiKey")}</Label>
					<Input
						id="apiKey"
						name="apiKey"
						type="password"
						placeholder={data.hasApiKey ? t(lang, "profile.apiKeyKeepPlaceholder") : t(lang, "profile.apiKeyPlaceholder")}
						aria-invalid={Boolean(form?.errors?.apiKey)}
					/>
					{#if form?.errors?.apiKey}
						<p class="text-sm text-red-600">{form.errors.apiKey[0]}</p>
					{/if}
				</div>
				<div class="space-y-2">
					<Label for="apiBaseUrl">{t(lang, "profile.baseUrl")}</Label>
					<select
						id="apiBaseUrl"
						name="apiBaseUrl"
						bind:value={apiBaseUrlValue}
						class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
						aria-invalid={Boolean(form?.errors?.apiBaseUrl)}
					>
						<option value="" disabled>{t(lang, "profile.selectApiProvider")}</option>
						{#each BYOK_API_BASE_URLS as baseUrl}
							<option value={baseUrl}>{BYOK_API_BASE_URL_LABELS[baseUrl]} — {baseUrl}</option>
						{/each}
					</select>
					{#if form?.errors?.apiBaseUrl}
						<p class="text-sm text-red-600">{form.errors.apiBaseUrl[0]}</p>
					{/if}
				</div>
				<div class="space-y-2">
					<Label for="apiModel">{t(lang, "profile.model")}</Label>
					<Input
						id="apiModel"
						name="apiModel"
						bind:value={apiModelValue}
						placeholder="deepseek-v4-flash"
						aria-invalid={Boolean(form?.errors?.apiModel)}
					/>
					{#if form?.errors?.apiModel}
						<p class="text-sm text-red-600">{form.errors.apiModel[0]}</p>
					{/if}
				</div>
				<div class="flex gap-3">
					<Button type="submit">{data.hasApiKey ? t(lang, "profile.updateApiKey") : t(lang, "profile.saveApiKey")}</Button>
					{#if data.hasApiKey}
						<Button type="submit" formaction="?/clearApiKey" variant="outline">{t(lang, "profile.removeApiKey")}</Button>
					{/if}
				</div>
			</form>
		</Card.Content>
	</Card.Root>

	<Separator />

	<form method="POST" action="?/signOut" onsubmit={() => clearQuestHallReturnContext(undefined, { clearAccount: true })} use:enhance>
		<Button type="submit" variant="outline">{t(lang, "nav.signOut")}</Button>
	</form>
</div>

<style>
.feedback-tabs {
	position: relative;
	isolation: isolate;
	display: grid;
	grid-template-columns: 1fr 1fr;
	padding: 4px;
	border: 1px solid var(--border);
	border-radius: 14px;
	background: #eae7e2;
}
.feedback-tabs::before {
	content: "";
	position: absolute;
	z-index: -1;
	left: 4px;
	top: 4px;
	bottom: 4px;
	width: calc(50% - 4px);
	border-radius: 10px;
	background: #fafaf9;
	box-shadow: 0 2px 6px #302a2015;
	transition: transform 320ms cubic-bezier(0.22, 1, 0.36, 1);
}
.feedback-tabs:has(input[value="target"]:checked)::before {
	transform: translateX(100%);
}
.feedback-tabs label {
	cursor: pointer;
	padding: 12px 8px;
	text-align: center;
	font-size: 0.875rem;
	color: #625c56;
	transition: color 220ms;
}
.feedback-tabs label:has(:checked) {
	color: #642f3a;
	font-weight: 600;
}
.feedback-tabs label:has(:focus-visible) {
	outline: 2px solid var(--ring);
	border-radius: 10px;
}
@media (prefers-reduced-motion: reduce) {
	.feedback-tabs::before,
	.feedback-tabs label {
		transition: none;
	}
}
</style>
