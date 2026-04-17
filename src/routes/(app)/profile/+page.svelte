<script lang="ts">
import { onMount } from "svelte";
import { enhance } from "$app/forms";
import { Button } from "$lib/components/ui/button";
import * as Card from "$lib/components/ui/card";
import { Input } from "$lib/components/ui/input";
import { Label } from "$lib/components/ui/label";
import { Separator } from "$lib/components/ui/separator";

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

const timezoneOptions = $derived(allTimezones.length > 0 ? allTimezones : (data.serverTimezones ?? []));

const languages = [
	{ value: "en", label: "English" },
	{ value: "es", label: "Español" },
	{ value: "fr", label: "Français" },
	{ value: "ja", label: "日本語" },
];

let timezoneInputValue = $state("");
let detectedTimezone = $state("");

$effect(() => {
	const val = form?.values?.timezone ?? data.user.timezone ?? "";
	timezoneInputValue = val;
});

onMount(() => {
	// Detect user's current local timezone
	detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

	// Rebuild the list with localized labels on the client side
	const lang = localeByLanguage[data.user.activeLanguage as keyof typeof localeByLanguage] ?? "en-US";

	try {
		const rawTimezones = Intl.supportedValuesOf("timeZone");
		allTimezones = rawTimezones.map((tz) => {
			try {
				const offsetParts = new Intl.DateTimeFormat(lang, {
					timeZone: tz,
					timeZoneName: "shortOffset",
				}).formatToParts(new Date());
				const utcOffset = offsetParts.find((p) => p.type === "timeZoneName")?.value.replace("GMT", "UTC") || "";

				const localizedName =
					new Intl.DateTimeFormat(lang, {
						timeZone: tz,
						timeZoneName: "long",
					})
						.formatToParts(new Date())
						.find((p) => p.type === "timeZoneName")?.value || tz;

				return {
					value: tz,
					label: `${tz} (${localizedName}, ${utcOffset})`,
				};
			} catch (e) {
				return { value: tz, label: tz };
			}
		});
	} catch (e) {
		// Fallback: keep the server-rendered list (already in allTimezones)
	}
});

function applyDetectedTimezone() {
	timezoneInputValue = detectedTimezone;
}
</script>

<div class="mx-auto max-w-2xl space-y-8">
	<h1 class="text-3xl font-bold">Profile</h1>

	{#if form?.success}
		<p class="rounded-md bg-green-50 p-3 text-sm text-green-700">Profile updated.</p>
	{/if}

	<Card.Root>
		<Card.Content class="pt-6">
			<div class="flex items-center gap-6">
				<img src={data.avatarUrl} alt="User Avatar" class="h-24 w-24 rounded-full border border-gray-200 object-cover shadow-sm">
				<div class="space-y-1">
					<h2 class="text-xl font-semibold">{data.user.name}</h2>
					<p class="text-sm text-muted-foreground">
						Your avatar is connected to your email via
						<a href="https://cravatar.cn" target="_blank" rel="noopener noreferrer" class="font-medium text-primary hover:underline"> Cravatar </a>.
					</p>
					<p class="text-xs text-muted-foreground">Want a custom image? Upload it at Gravatar/Cravatar and it will sync here automatically!</p>
				</div>
			</div>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header><Card.Title>Settings</Card.Title></Card.Header>
		<Card.Content>
			<form
				method="POST"
				action="?/updateProfile"
				use:enhance={() => {
					return async ({ update }) => {
						await update({ reset: false });
					};
				}}
				class="space-y-4"
			>
				<div class="space-y-2">
					<Label for="name">Name</Label>
					<Input id="name" name="name" value={form?.values?.name ?? data.user.name ?? ""} />
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
						class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
					<Input
						id="nativeLanguage"
						name="nativeLanguage"
						value={form?.values?.nativeLanguage ??
							data.user.nativeLanguage ??
							""}
						placeholder="e.g. zh-CN, ja, ko"
					/>
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
					{#each languages as lang}
						<option value={lang.value} selected={data.user.activeLanguage === lang.value}>{lang.label}</option>
					{/each}
				</select>
				<Button type="submit" variant="secondary">Switch</Button>
			</form>
		</Card.Content>
	</Card.Root>

	<Separator />

	<form method="POST" action="?/signOut" use:enhance><Button type="submit" variant="outline">Sign Out</Button></form>
</div>
