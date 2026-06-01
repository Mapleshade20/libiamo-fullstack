<script lang="ts">
import { enhance } from "$app/forms";
import { Badge } from "$lib/components/ui/badge";
import { Button } from "$lib/components/ui/button";
import * as Table from "$lib/components/ui/table";
import { INTERACTION_TYPE_LABELS, INTERACTION_TYPES, LANGUAGE_CODES, LANGUAGE_LABELS } from "$lib/constants";

let { data } = $props();
</script>

<svelte:head>
	<title>Templates · Admin · Libiamo</title>
	<meta name="description" content="Manage Libiamo practice templates.">
</svelte:head>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<h1>Templates</h1>
		<Button href="/admin/templates/new">New Template</Button>
	</div>

	<!-- Filters -->
	<form method="GET" class="flex flex-wrap gap-3">
		<select name="language" class="rounded-md border border-input bg-background px-3 py-2 text-sm">
			<option value="">All languages</option>
			{#each LANGUAGE_CODES as code}
				<option value={code} selected={data.filters.language === code}>{LANGUAGE_LABELS[code]}</option>
			{/each}
		</select>
		<select name="interactionType" class="rounded-md border border-input bg-background px-3 py-2 text-sm">
			<option value="">All types</option>
			{#each INTERACTION_TYPES as type}
				<option value={type} selected={data.filters.interactionType === type}>{INTERACTION_TYPE_LABELS[type]}</option>
			{/each}
		</select>
		<select name="active" class="rounded-md border border-input bg-background px-3 py-2 text-sm">
			<option value="">Active & Inactive</option>
			<option value="true" selected={data.filters.active === 'true'}>Active only</option>
			<option value="false" selected={data.filters.active === 'false'}>Inactive only</option>
		</select>
		<Button type="submit" variant="secondary" size="sm">Filter</Button>
	</form>

	<!-- Table -->
	<Table.Root>
		<Table.Header>
			<Table.Row>
				<Table.Head>ID</Table.Head>
				<Table.Head>Title</Table.Head>
				<Table.Head>Language</Table.Head>
				<Table.Head>Interaction Type</Table.Head>
				<Table.Head>Cadence</Table.Head>
				<Table.Head>Tags</Table.Head>
				<Table.Head>Difficulty</Table.Head>
				<Table.Head>Active</Table.Head>
				<Table.Head>Actions</Table.Head>
			</Table.Row>
		</Table.Header>
		<Table.Body>
			{#each data.templates as tpl}
				<Table.Row>
					<Table.Cell>{tpl.id}</Table.Cell>
					<Table.Cell class="max-w-[200px] truncate">{tpl.titleBase}</Table.Cell>
					<Table.Cell><Badge variant="outline">{tpl.language.toUpperCase()}</Badge></Table.Cell>
					<Table.Cell>{tpl.interactionType}</Table.Cell>
					<Table.Cell>{tpl.cadence}</Table.Cell>
					<Table.Cell class="text-xs text-muted-foreground">{tpl.tags?.join(', ') ?? ''}</Table.Cell>
					<Table.Cell>{tpl.difficulty}</Table.Cell>
					<Table.Cell>
						<form method="POST" action="?/toggleActive" use:enhance class="inline">
							<input type="hidden" name="id" value={tpl.id}>
							<input type="hidden" name="isActive" value={String(tpl.isActive)}>
							<button
								type="submit"
								class="rounded-full px-2 py-0.5 text-xs {tpl.isActive
									? 'bg-green-100 text-green-700'
									: 'bg-red-100 text-red-700'}"
							>
								{tpl.isActive ? 'Active' : 'Inactive'}
							</button>
						</form>
					</Table.Cell>
					<Table.Cell> <a href="/admin/templates/{tpl.id}" class="text-sm text-muted-foreground hover:underline">Edit</a> </Table.Cell>
				</Table.Row>
			{/each}
		</Table.Body>
	</Table.Root>

	{#if data.templates.length === 0}
		<p class="text-center text-muted-foreground">No templates found.</p>
	{/if}
</div>
