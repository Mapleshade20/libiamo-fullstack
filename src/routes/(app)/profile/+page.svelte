<script lang="ts">
import Check from "@lucide/svelte/icons/check";
import Pencil from "@lucide/svelte/icons/pencil";
import X from "@lucide/svelte/icons/x";
import { onMount, tick } from "svelte";
import { enhance } from "$app/forms";
import { handleInvalidField } from "$lib/client/form-attention";
import { clearQuestHallReturnContext } from "$lib/client/quest-hall/return-context";
import ActionNotification from "$lib/components/ActionNotification.svelte";
import FormErrorFocus from "$lib/components/FormErrorFocus.svelte";
import { Button } from "$lib/components/ui/button";
import * as Card from "$lib/components/ui/card";
import { Input } from "$lib/components/ui/input";
import { Label } from "$lib/components/ui/label";
import { Separator } from "$lib/components/ui/separator";
import { BYOK_API_BASE_URL_LABELS, BYOK_API_BASE_URLS, getNativeLanguageOptions } from "$lib/constants";
import { type LanguageCode, t } from "$lib/i18n";

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
let nameForm: HTMLFormElement | null = $state(null);
let nameInput: HTMLInputElement | null = $state(null);
let apiKeyForm: HTMLFormElement | null = $state(null);
let editingName = $state(false);
// svelte-ignore state_referenced_locally
let nameInputValue = $state(data.user.name ?? "");
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

async function startEditingName() {
	nameInputValue = data.user.name ?? "";
	editingName = true;
	await tick();
	nameInput?.focus();
	nameInput?.select();
}

function cancelEditingName() {
	nameInputValue = data.user.name ?? "";
	editingName = false;
}

function handleNameKeydown(event: KeyboardEvent) {
	if (event.key === "Escape") {
		event.preventDefault();
		cancelEditingName();
	}
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
					{#if editingName}
						<FormErrorFocus formRef={nameForm} errors={form?.errors} fieldOrder={["name"]} />
						<form
							bind:this={nameForm}
							method="POST"
							action="?/updateProfile"
							oninvalidcapture={handleInvalidField}
							use:enhance={() => {
								showActionNotification = false;
								return async ({ result, update }) => {
									await update({ reset: false });
									if (result.type === "success") editingName = false;
								};
							}}
							class="flex max-w-sm items-center gap-1.5"
						>
							<Input
								id="name"
								name="name"
								bind:ref={nameInput}
								bind:value={nameInputValue}
								onkeydown={handleNameKeydown}
								aria-label={t(lang, "profile.name")}
								aria-invalid={Boolean(form?.errors?.name)}
								class="h-8 text-base font-semibold"
							/>
							<button
								type="submit"
								class="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
								aria-label={t(lang, "profile.saveName")}
								title={t(lang, "profile.saveName")}
							>
								<Check size={17} />
							</button>
							<button
								type="button"
								onclick={cancelEditingName}
								class="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
								aria-label={t(lang, "profile.cancelNameEdit")}
								title={t(lang, "common.cancel")}
							>
								<X size={17} />
							</button>
						</form>
						{#if form?.errors?.name}
							<p class="text-sm text-red-600">{form.errors.name[0]}</p>
						{/if}
					{:else}
						<div class="flex items-center gap-1.5">
							<h2 class="truncate text-xl font-semibold">{data.user.name}</h2>
							<button
								type="button"
								onclick={startEditingName}
								class="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
								aria-label={t(lang, "profile.editName")}
								title={t(lang, "profile.editName")}
							>
								<Pencil size={15} />
							</button>
						</div>
					{/if}
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
					<div class="grid grid-cols-2 gap-2 rounded-xl bg-muted/60 p-1" role="radiogroup">
						<label class="cursor-pointer rounded-lg px-3 py-2 text-center text-sm has-[:checked]:bg-background has-[:checked]:shadow-sm">
							<input
								class="sr-only"
								type="radio"
								name="feedbackLanguagePreference"
								value="native"
								checked={(form?.values?.feedbackLanguagePreference ?? data.user.feedbackLanguagePreference) !== "target"}
							>
							{t(lang, "profile.feedbackNative")}
						</label>
						<label class="cursor-pointer rounded-lg px-3 py-2 text-center text-sm has-[:checked]:bg-background has-[:checked]:shadow-sm">
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
