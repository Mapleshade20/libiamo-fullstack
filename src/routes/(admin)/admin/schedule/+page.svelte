<script lang="ts">
import { enhance } from "$app/forms";
import { goto } from "$app/navigation";
import { page } from "$app/state";
import { handleInvalidField } from "$lib/client/form-attention";
import ActionNotification from "$lib/components/ActionNotification.svelte";
import FormErrorFocus from "$lib/components/FormErrorFocus.svelte";
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

// Initialize to empty string to match the placeholder option's value
let selectedTemplateId = $state<number | string>("");
let scheduleForm: HTMLFormElement | null = $state(null);

const actionNotification = $derived(
	form?.success
		? { variant: "success" as const, title: "Task scheduled", message: "The task has been added to the selected date." }
		: form?.message
			? { variant: "error" as const, title: "Unable to schedule task", message: form.message }
			: null,
);

// Use effect to safely sync selectedTemplateId whenever activeTemplates changes
$effect(() => {
	const normalizedSelectedTemplateId = Number(selectedTemplateId);
	if (data.activeTemplates.length > 0) {
		if (!data.activeTemplates.some((t) => t.id === normalizedSelectedTemplateId)) {
			selectedTemplateId = data.activeTemplates[0].id;
		}
	} else {
		selectedTemplateId = "";
	}
});

function toggleMode(newMode: "daily" | "weekly") {
	if (mode === newMode) return;
	const url = new URL(page.url);
	url.searchParams.set("mode", newMode);
	url.searchParams.delete("date");
	goto(url.toString(), { keepFocus: true });
}
</script>

<svelte:head>
	<title>Schedule · Admin · Libiamo</title>
	<meta name="description" content="Review and manage scheduled learner tasks.">
</svelte:head>

<div class="space-y-8">
	<ActionNotification notification={actionNotification} />

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
			<FormErrorFocus formRef={scheduleForm} errors={form?.errors} fieldOrder={["templateId", "date"]} />

			<form
				bind:this={scheduleForm}
				method="POST"
				action="?/schedule"
				use:enhance
				class="flex flex-wrap items-end gap-4"
				oninvalidcapture={handleInvalidField}
			>
				<div class="space-y-1">
					<Label for="templateId">Template</Label>
					<select
						id="templateId"
						name="templateId"
						bind:value={selectedTemplateId}
						class="flex h-10 w-64 rounded-md border border-input bg-background px-3 py-2 text-sm aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20"
						required
						aria-invalid={Boolean(form?.errors?.templateId)}
					>
						{#if data.activeTemplates.length === 0}
							<option value="" disabled>No active {mode} templates</option>
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
					<Input
						id="scheduleDate"
						name="date"
						type={mode === "daily" ? "date" : "week"}
						lang="en"
						value={rawDate}
						required
						aria-invalid={Boolean(form?.errors?.date)}
					/>
					{#if form?.errors?.date}
						<p class="text-sm text-red-600">{form.errors.date[0]}</p>
					{/if}
				</div>

				<Button type="submit" disabled={data.activeTemplates.length === 0}>Schedule</Button>
			</form>
		</Card.Content>
	</Card.Root>
</div>
