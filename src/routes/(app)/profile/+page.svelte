<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Separator } from '$lib/components/ui/separator';
	import * as Card from '$lib/components/ui/card';

	let { form, data } = $props();

	const languages = [
		{ value: "en", label: "English" },
		{ value: "es", label: "Español" },
		{ value: "fr", label: "Français" },
		{ value: "ja", label: "日本語" },
	];
</script>

<div class="mx-auto max-w-2xl space-y-8">
	<h1 class="text-3xl font-bold">Profile</h1>

	{#if form?.success}
		<p class="rounded-md bg-green-50 p-3 text-sm text-green-700">Profile updated.</p>
	{/if}

	<Card.Root>
		<Card.Content class="pt-6">
			<div class="flex items-center gap-6">
				<img
					src={data.avatarUrl}
					alt="User Avatar"
					class="h-24 w-24 rounded-full border border-gray-200 object-cover shadow-sm"
				/>
				<div class="space-y-1">
					<h2 class="text-xl font-semibold">
						{data.user.name}
					</h2>
					<p class="text-sm text-muted-foreground">
						Your avatar is connected to your email via
						<a
							href="https://cravatar.cn"
							target="_blank"
							rel="noopener noreferrer"
							class="text-primary hover:underline font-medium"
						>
							Cravatar
						</a>.
					</p>
					<p class="text-xs text-muted-foreground">
						Want a custom image? Upload it at Gravatar/Cravatar and it will
						sync here automatically!
					</p>
				</div>
			</div>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>Settings</Card.Title>
		</Card.Header>
		<Card.Content>
			<form
				method="POST"
				action="?/updateProfile"
				use:enhance={() => {
					// Prevent default form reset on success to keep input values
					return async ({ update }) => {
						await update({ reset: false });
					};
				}}
				class="space-y-4"
			>
				<div class="space-y-2">
					<Label for="name">Name</Label>
					<Input
						id="name"
						name="name"
						value={form?.values?.name ?? data.user.name ?? ''}
					/>
					{#if form?.errors?.name}
						<p class="text-sm text-red-600">{form.errors.name[0]}</p>
					{/if}
				</div>

				<div class="space-y-2">
					<Label for="timezone">Timezone</Label>
					<Input
						id="timezone"
						name="timezone"
						value={form?.values?.timezone ?? data.user.timezone ?? ''}
						placeholder="e.g. America/New_York"
					/>
				</div>

				<div class="space-y-2">
					<Label for="nativeLanguage">Native Language</Label>
					<Input
						id="nativeLanguage"
						name="nativeLanguage"
						value={form?.values?.nativeLanguage ?? data.user.nativeLanguage ?? ''}
						placeholder="e.g. zh-CN, ja, ko"
					/>
				</div>

				<Button type="submit">Save</Button>
			</form>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>Learning Language</Card.Title>
		</Card.Header>
		<Card.Content>
			<form method="POST" action="?/switchLanguage" use:enhance class="flex items-center gap-3">
				<select
					name="language"
					class="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
				>
					{#each languages as lang}
						<option value={lang.value} selected={data.user.activeLanguage === lang.value}>
							{lang.label}
						</option>
					{/each}
				</select>
				<Button type="submit" variant="secondary">Switch</Button>
			</form>
		</Card.Content>
	</Card.Root>

	<Separator />

	<form method="POST" action="?/signOut" use:enhance>
		<Button type="submit" variant="outline">Sign Out</Button>
	</form>
</div>
