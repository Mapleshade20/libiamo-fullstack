<script lang="ts">
import { enhance } from "$app/forms";
import { Badge } from "$lib/components/ui/badge";
import { Button } from "$lib/components/ui/button";
import * as Card from "$lib/components/ui/card";
import { Input } from "$lib/components/ui/input";
import { Label } from "$lib/components/ui/label";
import * as Table from "$lib/components/ui/table";
import { LANGUAGE_CODES, LANGUAGE_LABELS } from "$lib/constants";

let { form, data } = $props();
</script>

<div class="space-y-8">
	<h1>Schedule</h1>

	<!-- Filters -->
	<form method="GET" class="flex flex-wrap gap-3">
		<div class="space-y-1">
			<Label for="date">Date</Label>
			<Input id="date" name="date" type="date" value={data.filters.date} />
		</div>
		<div class="space-y-1">
			<Label for="language">Language</Label>
			<select id="language" name="language" class="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm">
				{#each LANGUAGE_CODES as code}
					<option value={code} selected={data.filters.language === code}>{LANGUAGE_LABELS[code]}</option>
				{/each}
			</select>
		</div>
		<div class="flex items-end"><Button type="submit" variant="secondary">View</Button></div>
	</form>

	<!-- Scheduled Tasks -->
	<div>
		<h2 class="mb-3 text-lg font-semibold">Tasks for {data.filters.date} ({data.filters.language.toUpperCase()})</h2>
		{#if data.scheduledTasks.length > 0}
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>ID</Table.Head>
						<Table.Head>Title</Table.Head>
						<Table.Head>Interaction Type</Table.Head>
						<Table.Head>Cadence</Table.Head>
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
							<Table.Cell> <Badge variant={t.origin === 'auto' ? 'secondary' : 'default'}>{t.origin}</Badge> </Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		{:else}
			<p class="text-muted-foreground">No tasks scheduled for this date.</p>
		{/if}
	</div>

	<!-- Schedule Form -->
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
					<select id="templateId" name="templateId" class="flex h-10 w-64 rounded-md border border-input bg-background px-3 py-2 text-sm" required>
						{#each data.activeTemplates as tpl}
							<option value={tpl.id}>{tpl.id} — {tpl.titleBase} ({tpl.language.toUpperCase()})</option>
						{/each}
					</select>
					{#if form?.errors?.templateId}
						<p class="text-sm text-red-600">{form.errors.templateId[0]}</p>
					{/if}
				</div>
				<div class="space-y-1">
					<Label for="scheduleDate">Date</Label>
					<Input id="scheduleDate" name="date" type="date" value={data.filters.date} required />
					{#if form?.errors?.date}
						<p class="text-sm text-red-600">{form.errors.date[0]}</p>
					{/if}
				</div>
				<Button type="submit">Schedule</Button>
			</form>
		</Card.Content>
	</Card.Root>
</div>
