<script lang="ts">
import { onMount } from "svelte";
import { enhance } from "$app/forms";
import { handleInvalidField } from "$lib/client/form-attention";
import ActionNotification from "$lib/components/ActionNotification.svelte";
import FormErrorFocus from "$lib/components/FormErrorFocus.svelte";
import { Button } from "$lib/components/ui/button";
import * as Card from "$lib/components/ui/card";
import { Input } from "$lib/components/ui/input";
import { Label } from "$lib/components/ui/label";
import { Separator } from "$lib/components/ui/separator";
import { BYOK_API_BASE_URL_LABELS, BYOK_API_BASE_URLS, getNativeLanguageOptions, LANGUAGE_CODES, LANGUAGE_LABELS } from "$lib/constants";

let { form, data } = $props();

const localeByLanguage = {
	en: "en-US",
	es: "es-ES",
	fr: "fr-FR",
	ja: "ja-JP",
} as const;

// Start with server-rendered list (progressive enhancement fallback),
// then replace with localized labels on the client.
let allTimezones = $state<{ value: string; label: string }[]>([]);
let localizedNativeLanguageOptions = $state<{ value: string; label: string }[]>([]);

const timezoneOptions = $derived(allTimezones.length > 0 ? allTimezones : (data.serverTimezones ?? []));
const nativeLanguageOptions = $derived(
	localizedNativeLanguageOptions.length > 0 ? localizedNativeLanguageOptions : (data.serverNativeLanguages ?? []),
);

let timezoneInputValue = $state("");
let nativeLanguageInputValue = $state("");
let apiBaseUrlValue = $state("");
let apiModelValue = $state("");
let detectedTimezone = $state("");
let settingsForm: HTMLFormElement | null = $state(null);
let apiKeyForm: HTMLFormElement | null = $state(null);

const actionNotification = $derived(
	form?.success
		? { variant: "success" as const, title: "Profile updated", message: "Your changes have been saved." }
		: form?.message
			? { variant: "error" as const, title: "Unable to save", message: form.message }
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
	const val = form?.values?.timezone ?? data.user.timezone ?? "";
	timezoneInputValue = val;
});

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
	// Detect user's current local timezone
	detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

	// Rebuild the list with localized labels on the client side
	const lang = localeByLanguage[data.user.activeLanguage as keyof typeof localeByLanguage] ?? "en-US";
	localizedNativeLanguageOptions = getNativeLanguageOptions(lang);

	try {
		const rawTimezones = Intl.supportedValuesOf("timeZone");
		allTimezones = rawTimezones.map((tz) => {
			try {
				const now = new Date();

				const offsetParts = new Intl.DateTimeFormat(lang, {
					timeZone: tz,
					timeZoneName: "shortOffset",
				}).formatToParts(now);
				const utcOffset = offsetParts.find((p) => p.type === "timeZoneName")?.value.replace("GMT", "UTC") || "";

				const localizedName =
					new Intl.DateTimeFormat(lang, {
						timeZone: tz,
						timeZoneName: "long",
					})
						.formatToParts(now)
						.find((p) => p.type === "timeZoneName")?.value || tz;

				return {
					value: tz,
					label: `${tz} (${localizedName}, ${utcOffset})`,
				};
			} catch {
				return { value: tz, label: tz };
			}
		});
	} catch {
		// Fallback: leave allTimezones empty so timezoneOptions continues using data.serverTimezones.
	}
});

function applyDetectedTimezone() {
	timezoneInputValue = detectedTimezone;
}
</script>

<svelte:head>
	<title>Profile · Libiamo</title>
	<meta name="description" content="Manage your profile.">
</svelte:head>

<div class="mx-auto max-w-2xl space-y-8">
	<h1 class="text-3xl">Profile</h1>

	<ActionNotification notification={actionNotification} />

	<Card.Root>
		<Card.Content class="pt-6">
			<div class="flex items-center gap-6">
				<img src={data.avatarUrl} alt="User Avatar" class="h-24 w-24 rounded-full border border-gray-200 object-cover shadow-sm">
				<div class="space-y-1">
					<h2 class="text-xl font-semibold">{data.user.name}</h2>
					<p class="text-sm text-muted-foreground">
						Your avatar is connected to your email via
						<a href="https://gravatar.com" target="_blank" rel="noopener noreferrer" class="font-medium text-primary hover:underline">Gravatar</a>.
					</p>
					<p class="text-xs text-muted-foreground">Add a profile photo on Gravatar to display it here!</p>
				</div>
			</div>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header><Card.Title>Settings</Card.Title></Card.Header>
		<Card.Content>
			<FormErrorFocus formRef={settingsForm} errors={form?.errors} fieldOrder={["name", "timezone", "nativeLanguage"]} />
			<form
				bind:this={settingsForm}
				method="POST"
				action="?/updateProfile"
				oninvalidcapture={handleInvalidField}
				use:enhance={() => {
					return async ({ update }) => {
						await update({ reset: false });
					};
				}}
				class="space-y-4"
			>
				<div class="space-y-2">
					<Label for="name">Name</Label>
					<Input id="name" name="name" value={form?.values?.name ?? data.user.name ?? ""} aria-invalid={Boolean(form?.errors?.name)} />
					{#if form?.errors?.name}
						<p class="text-sm text-red-600">{form.errors.name[0]}</p>
					{/if}
				</div>

				<div class="space-y-2">
					<Label for="timezone">Timezone</Label>
					<select
						id="timezone"
						name="timezone"
						bind:value={timezoneInputValue}
						aria-invalid={Boolean(form?.errors?.timezone)}
						class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20"
					>
						<option value="" disabled>Select your timezone</option>
						{#each timezoneOptions as tz}
							<option value={tz.value}>{tz.label}</option>
						{/each}
					</select>

					{#if detectedTimezone && timezoneInputValue !== detectedTimezone}
						<div class="mt-1 text-xs text-muted-foreground">
							Current local timezone: <span class="font-bold text-foreground">{detectedTimezone}</span>.
							<button type="button" class="ml-1 font-medium text-black underline hover:no-underline" onclick={applyDetectedTimezone}>
								Use this instead
							</button>
						</div>
					{/if}
					{#if form?.errors?.timezone}
						<p class="text-sm text-red-600">{form.errors.timezone[0]}</p>
					{/if}
				</div>

				<div class="space-y-2">
					<Label for="nativeLanguage">Native Language</Label>
					<select
						id="nativeLanguage"
						name="nativeLanguage"
						bind:value={nativeLanguageInputValue}
						aria-invalid={Boolean(form?.errors?.nativeLanguage)}
						class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20"
					>
						<option value="">Select your native language</option>
						{#each nativeLanguageOptions as language}
							<option value={language.value}>{language.label}</option>
						{/each}
					</select>
					{#if form?.errors?.nativeLanguage}
						<p class="text-sm text-red-600">{form.errors.nativeLanguage[0]}</p>
					{/if}
				</div>

				<Button type="submit">Save</Button>
			</form>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header><Card.Title>Learning Language</Card.Title></Card.Header>
		<Card.Content>
			<form method="POST" action="?/switchLanguage" use:enhance class="flex items-center gap-3">
				<select name="language" class="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background">
					{#each LANGUAGE_CODES as lang}
						<option value={lang} selected={data.user.activeLanguage === lang}>{LANGUAGE_LABELS[lang]}</option>
					{/each}
				</select>
				<Button type="submit" variant="secondary">Switch</Button>
			</form>
		</Card.Content>
	</Card.Root>

	{#if !data.hasApiKey && data.trialQuota}
		<Card.Root>
			<Card.Header> <Card.Title>LLM Trial</Card.Title> </Card.Header>
			<Card.Content class="space-y-3">
				<div class="flex items-center justify-between text-sm">
					<span class="text-muted-foreground">Trial balance remaining</span>
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
		<Card.Header> <Card.Title>LLM API Key</Card.Title> </Card.Header>
		<Card.Content>
			{#if data.hasApiKey}
				<p class="mb-4 text-sm text-green-700">&#x2705; Your own API key is configured 🎉</p>
			{:else}
				<p class="mb-4 text-sm text-muted-foreground">
					No custom API key set. We recommend obtaining one from
					<a href="https://platform.deepseek.com" target="_blank" rel="noopener noreferrer" class="underline hover:text-foreground underline-offset-2"
						>DeepSeek Platform</a
					>
					❤️
				</p>
				{#if data.trialQuota && trialTone === "depleted"}
					<div class="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
						<p class="font-semibold">You have run out of trial tokens.</p>
						<p class="mt-1">Add an API key from DeepSeek or another OpenAI-compatible provider to continue learning without interruption 😃</p>
					</div>
				{:else if data.trialQuota && trialTone === "low"}
					<div class="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
						<p class="font-semibold">Your trial balance is running low.</p>
						<p class="mt-1">Configure your own API key now to avoid interruption ☺️</p>
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
					return async ({ update }) => {
						await update({ reset: false });
					};
				}}
				class="space-y-3"
			>
				<div class="space-y-2">
					<Label for="apiKey">API Key</Label>
					<Input
						id="apiKey"
						name="apiKey"
						type="password"
						placeholder={data.hasApiKey ? "•••••••• (leave empty to keep current)" : "Enter your API key"}
						aria-invalid={Boolean(form?.errors?.apiKey)}
					/>
					{#if form?.errors?.apiKey}
						<p class="text-sm text-red-600">{form.errors.apiKey[0]}</p>
					{/if}
				</div>
				<div class="space-y-2">
					<Label for="apiBaseUrl">Base URL (OpenAI-compatible; accessible in Mainland China)</Label>
					<select
						id="apiBaseUrl"
						name="apiBaseUrl"
						bind:value={apiBaseUrlValue}
						class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
						aria-invalid={Boolean(form?.errors?.apiBaseUrl)}
					>
						<option value="" disabled>Select an API provider</option>
						{#each BYOK_API_BASE_URLS as baseUrl}
							<option value={baseUrl}>{BYOK_API_BASE_URL_LABELS[baseUrl]} — {baseUrl}</option>
						{/each}
					</select>
					{#if form?.errors?.apiBaseUrl}
						<p class="text-sm text-red-600">{form.errors.apiBaseUrl[0]}</p>
					{/if}
				</div>
				<div class="space-y-2">
					<Label for="apiModel">Model</Label>
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
					<Button type="submit">{data.hasApiKey ? "Update API Key" : "Save API Key"}</Button>
					{#if data.hasApiKey}
						<Button type="submit" formaction="?/clearApiKey" variant="outline">Remove API Key</Button>
					{/if}
				</div>
			</form>
		</Card.Content>
	</Card.Root>

	<Separator />

	<form method="POST" action="?/signOut" use:enhance><Button type="submit" variant="outline">Sign Out</Button></form>
</div>
