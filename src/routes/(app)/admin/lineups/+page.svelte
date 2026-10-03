<script lang="ts">
import { enhance } from "$app/forms";
import { page } from "$app/state";
import { handleInvalidField } from "$lib/client/form-attention";
import ActionNotification from "$lib/components/common/ActionNotification.svelte";
import FormErrorFocus from "$lib/components/common/FormErrorFocus.svelte";
import SegmentedControl from "$lib/components/common/SegmentedControl.svelte";
import Select from "$lib/components/common/Select.svelte";
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
let selectedTaskId = $state<string>(String(data.candidates[0]?.id ?? ""));
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
			selectedTaskId = String(data.candidates[0].id);
		}
	} else {
		selectedTaskId = "";
	}
});

function modeHref(kind: "daily" | "weekly") {
	const url = new URL(page.url);
	url.searchParams.set("kind", kind);
	url.searchParams.delete("date");
	return `${url.pathname}${url.search}`;
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

	<div class="flex flex-wrap items-center justify-between gap-4">
		<h1>Lineups</h1>
		<SegmentedControl
			label="Lineup kind"
			value={mode}
			items={[
				{ value: "daily", label: "Daily", href: modeHref("daily") },
				{ value: "weekly", label: "Weekly", href: modeHref("weekly") },
			]}
		/>
	</div>

	<form method="GET" class="flex flex-wrap items-end gap-3" onchange={submitFilters}>
		<input type="hidden" name="kind" value={mode}>

		<div class="flex flex-col gap-1.5">
			<Label for="date">{mode === "daily" ? "Date" : "Week"}</Label>
			<Input id="date" name="date" type={mode === "daily" ? "date" : "week"} lang="en" value={rawDate} class="w-48" />
		</div>

		<div class="flex flex-col gap-1.5">
			<Label for="language">Language</Label>
			<Select
				id="language"
				name="language"
				class="w-40"
				value={data.filters.language}
				items={LANGUAGE_CODES.map((code) => ({ value: code, label: LANGUAGE_LABELS[code] }))}
			/>
		</div>
	</form>

	<section class="space-y-3">
		<h2>
			{mode === "daily" ? "Daily" : "Weekly"}
			lineup from {data.filters.startsOn}
			<span class="text-muted-foreground">· {LANGUAGE_LABELS[data.filters.language as keyof typeof LANGUAGE_LABELS] ?? data.filters.language}</span>
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
								<Badge variant={t.origin === "auto" ? "outline" : "secondary"}>{t.origin === "auto" ? "Auto" : "Manual"}</Badge>
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		{:else}
			<p class="text-sm text-muted-foreground">
				No tasks lined up for this
				{mode === "daily" ? "date" : "week"}.
			</p>
		{/if}
	</section>

	<Card.Root>
		<Card.Header> <Card.Title>Add a task to a lineup</Card.Title> </Card.Header>
		<Card.Content>
			<FormErrorFocus formRef={lineupForm} errors={form?.errors} fieldOrder={["taskId", "date"]} />

			<form
				bind:this={lineupForm}
				method="POST"
				action="?/add"
				use:enhance
				class="grid gap-4 sm:grid-cols-[minmax(0,1fr)_12rem_auto] sm:items-start"
				oninvalidcapture={handleInvalidField}
			>
				<input type="hidden" name="kind" value={mode}>
				<div class="flex min-w-0 flex-col gap-1.5" data-field-container>
					<Label for="taskId">Task</Label>
					<Select
						id="taskId"
						name="taskId"
						bind:value={selectedTaskId}
						required
						disabled={data.candidates.length === 0}
						placeholder="No other active chat tasks in this language"
						aria-invalid={Boolean(form?.errors?.taskId)}
						items={data.candidates.map((candidate) => ({ value: String(candidate.id), label: `${candidate.id} — ${candidate.title}` }))}
					/>
					{#if form?.errors?.taskId}
						<p data-field-error="taskId" class="field-error-message">{form.errors.taskId[0]}</p>
					{/if}
				</div>

				<div class="flex flex-col gap-1.5" data-field-container>
					<Label for="lineupDate">{mode === "daily" ? "Date" : "Week"}</Label>
					<Input
						id="lineupDate"
						name="date"
						type={mode === "daily" ? "date" : "week"}
						lang="en"
						value={rawDate}
						required
						aria-invalid={Boolean(form?.errors?.date)}
					/>
					{#if form?.errors?.date}
						<p data-field-error="date" class="field-error-message">{form.errors.date[0]}</p>
					{/if}
				</div>

				<Button type="submit" class="sm:mt-[1.625rem]" disabled={data.candidates.length === 0}>Add to lineup</Button>
			</form>
		</Card.Content>
	</Card.Root>
</div>
