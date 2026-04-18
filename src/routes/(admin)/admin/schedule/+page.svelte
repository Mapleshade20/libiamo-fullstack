<script lang="ts">
import { enhance } from "$app/forms";
import { goto } from "$app/navigation";
import { page } from "$app/stores";
import { Badge } from "$lib/components/ui/badge";
import { Button } from "$lib/components/ui/button";
import * as Card from "$lib/components/ui/card";
import { Input } from "$lib/components/ui/input";
import { Label } from "$lib/components/ui/label";
import * as Table from "$lib/components/ui/table";
import { LANGUAGE_CODES, LANGUAGE_LABELS } from "$lib/constants";

let { form, data } = $props();

let mode = $derived(data.filters.mode);
let rawDate = $derived(data.filters.rawDate);
let language = $derived(data.filters.language);

// Initialize safely without referencing reactive props directly to avoid Svelte 5 warnings
let selectedTemplateId = $state<number>(0);

// Use effect to safely sync selectedTemplateId whenever activeTemplates changes
$effect(() => {
	if (data.activeTemplates.length > 0) {
		if (!data.activeTemplates.some((t) => t.id === selectedTemplateId)) {
			selectedTemplateId = data.activeTemplates[0].id;
		}
	} else {
		selectedTemplateId = 0;
	}
});

function toggleMode(newMode: "daily" | "weekly") {
	if (mode === newMode) return;
	const url = new URL($page.url);
	url.searchParams.set("mode", newMode);
	url.searchParams.delete("date");
	goto(url.toString(), { keepFocus: true });
}
</script>

<div class="space-y-8">
	<div class="flex items-center justify-between">
		<h1 class="text-2xl font-bold">Schedule</h1>

		<div class="relative flex h-10 w-48 items-center rounded-md bg-muted p-1">
			<div
				class="absolute bottom-1 left-1 top-1 w-[calc(50%-4px)] rounded-sm bg-background shadow-sm transition-transform duration-200 ease-in-out"
				class:translate-x-full={mode === "weekly"}
			></div>

			<button
				type="button"
				class="relative z-10 w-1/2 py-1 text-sm font-medium transition-colors"
				class:text-foreground={mode === "daily"}
				class:text-muted-foreground={mode !== "daily"}
				onclick={() => toggleMode("daily")}
			>
				Daily
			</button>

			<button
				type="button"
				class="relative z-10 w-1/2 py-1 text-sm font-medium transition-colors"
				class:text-foreground={mode === "weekly"}
				class:text-muted-foreground={mode !== "weekly"}
				onclick={() => toggleMode("weekly")}
			>
				Weekly
			</button>
		</div>
	</div>

	<form method="GET" class="flex flex-wrap items-end gap-4">
		<input type="hidden" name="mode" value={mode}>

		<div class="space-y-1">
			<Label for="date">{mode === "daily" ? "Date" : "Week"}</Label>
			<Input id="date" name="date" type={mode === "daily" ? "date" : "week"} lang="en" value={rawDate} class="w-48" />
		</div>

		<div class="space-y-1">
			<Label for="language">Language</Label>
			<select id="language" name="language" class="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm">
				{#each LANGUAGE_CODES as code}
					<option value={code} selected={data.filters.language === code}>{LANGUAGE_LABELS[code]}</option>
				{/each}
			</select>
		</div>

		<Button type="submit" variant="secondary">View</Button>
	</form>

	<div>
		<h2 class="mb-3 text-lg font-semibold">Tasks for {data.filters.date} ({data.filters.language.toUpperCase()})</h2>
		{#if data.scheduledTasks.length > 0}
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>ID</Table.Head>
						<Table.Head>Title</Table.Head>
						<Table.Head>Interaction Type</Table.Head>
						<Table.Head>Origin</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each data.scheduledTasks as t}
						<Table.Row>
							<Table.Cell>{t.id}</Table.Cell>
							<Table.Cell>{t.title}</Table.Cell>
							<Table.Cell>{t.templateInteractionType}</Table.Cell>
							<Table.Cell>{t.templateCadence}</Table.Cell>
							<Table.Cell>
								<Badge
									variant={t.origin === "auto"
										? "secondary"
										: "default"}
									>{t.origin}</Badge
								>
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		{:else}
			<p class="text-muted-foreground">
				No tasks scheduled for this
				{mode === "daily" ? "date" : "week"}.
			</p>
		{/if}
	</div>

	<Card.Root>
		<Card.Header> <Card.Title>Schedule Task Manually</Card.Title> </Card.Header>
		<Card.Content>
			{#if form?.success}
				<p class="mb-4 rounded-md bg-green-50 p-3 text-sm text-green-700">Task scheduled.</p>
			{/if}
			{#if form?.message}
				<p class="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{form.message}</p>
			{/if}

			<form method="POST" action="?/schedule" use:enhance class="flex flex-wrap items-end gap-4">
				<div class="space-y-1">
					<Label for="templateId">Template</Label>
					<select
						id="templateId"
						name="templateId"
						bind:value={selectedTemplateId}
						class="flex h-10 w-64 rounded-md border border-input bg-background px-3 py-2 text-sm"
						required
					>
						{#if data.activeTemplates.length === 0}
							<option value="" disabled selected>No active {mode} templates</option>
						{/if}
						{#each data.activeTemplates as tpl}
							<option value={tpl.id}>{tpl.id} — {tpl.titleBase} ({tpl.language.toUpperCase()})</option>
						{/each}
					</select>
					{#if form?.errors?.templateId}
						<p class="text-sm text-red-600">{form.errors.templateId[0]}</p>
					{/if}
				</div>

				<div class="space-y-1">
					<Label for="scheduleDate">{mode === "daily" ? "Date" : "Week"}</Label>
					<Input id="scheduleDate" name="date" type={mode === "daily" ? "date" : "week"} lang="en" value={rawDate} required />
					{#if form?.errors?.date}
						<p class="text-sm text-red-600">{form.errors.date[0]}</p>
					{/if}
				</div>

				<Button type="submit" disabled={data.activeTemplates.length === 0}>Schedule</Button>
			</form>
		</Card.Content>
	</Card.Root>
</div>
