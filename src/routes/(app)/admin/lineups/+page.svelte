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
import { LANGUAGE_CODES, LANGUAGE_LABELS, UI_VARIANT_LABELS } from "$lib/constants";

let { form, data } = $props();

let mode = $derived(data.filters.kind);
let rawDate = $derived(data.filters.rawDate);

// svelte-ignore state_referenced_locally
let selectedTaskId = $state<number | string>(data.candidates[0]?.id ?? "");
let lineupForm: HTMLFormElement | null = $state(null);

const actionNotification = $derived(
	form?.success
		? { variant: "success" as const, title: "Task lined up", message: "The task has been added to the selected lineup." }
		: form?.message
			? { variant: "error" as const, title: "Unable to line up task", message: form.message }
			: null,
);

// Keep the selection valid whenever the candidate list changes
$effect(() => {
	const normalizedSelectedTaskId = Number(selectedTaskId);
	if (data.candidates.length > 0) {
		if (!data.candidates.some((candidate) => candidate.id === normalizedSelectedTaskId)) {
			selectedTaskId = data.candidates[0].id;
		}
	} else {
		selectedTaskId = "";
	}
});

function toggleMode(newMode: "daily" | "weekly") {
	if (mode === newMode) return;
	const url = new URL(page.url);
	url.searchParams.set("kind", newMode);
	url.searchParams.delete("date");
	goto(url.toString(), { keepFocus: true });
}

function submitFilters(event: Event) {
	(event.currentTarget as HTMLFormElement).requestSubmit();
}
</script>

<svelte:head>
	<title>Lineups · Admin · Libiamo</title>
	<meta name="description" content="Review and manage the daily and weekly task lineups.">
</svelte:head>

<div class="space-y-8">
	<ActionNotification notification={actionNotification} />

	<div class="flex items-center justify-between">
		<h1 class="text-3xl">Lineups</h1>

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

	<form method="GET" class="flex flex-wrap items-end gap-4" onchange={submitFilters}>
		<input type="hidden" name="kind" value={mode}>

		<div class="space-y-1">
			<Label for="date">{mode === "daily" ? "Date" : "Week"}</Label>
			<Input id="date" name="date" type={mode === "daily" ? "date" : "week"} lang="en" value={rawDate} class="h-10 w-48" />
		</div>

		<div class="space-y-1">
			<Label for="language">Language</Label>
			<select id="language" name="language" class="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm">
				{#each LANGUAGE_CODES as code}
					<option value={code} selected={data.filters.language === code}>{LANGUAGE_LABELS[code]}</option>
				{/each}
			</select>
		</div>
	</form>

	<div>
		<h2 class="mb-3 text-lg font-semibold">
			{mode === "daily" ? "Daily" : "Weekly"}
			lineup starting {data.filters.startsOn} ({data.filters.language.toUpperCase()})
		</h2>
		{#if data.entries.length > 0}
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>ID</Table.Head>
						<Table.Head>Title</Table.Head>
						<Table.Head>Interface</Table.Head>
						<Table.Head>Origin</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each data.entries as t}
						<Table.Row>
							<Table.Cell>{t.id}</Table.Cell>
							<Table.Cell class="max-w-md truncate" title={t.title}>{t.title}</Table.Cell>
							<Table.Cell>{UI_VARIANT_LABELS[t.ui]}</Table.Cell>
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
				No tasks lined up for this
				{mode === "daily" ? "date" : "week"}.
			</p>
		{/if}
	</div>

	<Card.Root>
		<Card.Header> <Card.Title>Add a Task to a Lineup</Card.Title> </Card.Header>
		<Card.Content>
			<FormErrorFocus formRef={lineupForm} errors={form?.errors} fieldOrder={["taskId", "date"]} />

			<form
				bind:this={lineupForm}
				method="POST"
				action="?/add"
				use:enhance
				class="flex flex-wrap items-end gap-4"
				oninvalidcapture={handleInvalidField}
			>
				<input type="hidden" name="kind" value={mode}>
				<div class="space-y-1">
					<Label for="taskId">Task</Label>
					<select
						id="taskId"
						name="taskId"
						bind:value={selectedTaskId}
						class="flex h-10 w-64 rounded-md border border-input bg-background px-3 py-2 text-sm aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20"
						required
						aria-invalid={Boolean(form?.errors?.taskId)}
					>
						{#if data.candidates.length === 0}
							<option value="" disabled>No other active chat tasks in this language</option>
						{/if}
						{#each data.candidates as candidate}
							<option value={candidate.id}>{candidate.id} — {candidate.title}</option>
						{/each}
					</select>
					{#if form?.errors?.taskId}
						<p data-field-error="taskId" class="text-sm text-red-600">{form.errors.taskId[0]}</p>
					{/if}
				</div>

				<div class="space-y-1">
					<Label for="lineupDate">{mode === "daily" ? "Date" : "Week"}</Label>
					<Input
						id="lineupDate"
						name="date"
						type={mode === "daily" ? "date" : "week"}
						lang="en"
						value={rawDate}
						required
						class="h-10"
						aria-invalid={Boolean(form?.errors?.date)}
					/>
					{#if form?.errors?.date}
						<p data-field-error="date" class="text-sm text-red-600">{form.errors.date[0]}</p>
					{/if}
				</div>

				<Button type="submit" disabled={data.candidates.length === 0}>Add to Lineup</Button>
			</form>
		</Card.Content>
	</Card.Root>
</div>
