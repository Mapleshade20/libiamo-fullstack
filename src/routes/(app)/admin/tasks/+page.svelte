<script lang="ts">
import { base } from "$app/paths";
import { Badge } from "$lib/components/ui/badge";
import { Button } from "$lib/components/ui/button";
import * as Table from "$lib/components/ui/table";
import { INTERACTION_TYPE_LABELS, INTERACTION_TYPES, LANGUAGE_CODES, LANGUAGE_LABELS, LINEUP_KIND_LABELS, UI_VARIANT_LABELS } from "$lib/constants";

let { data } = $props();

function submitFilters(event: Event) {
	(event.currentTarget as HTMLFormElement).requestSubmit();
}
</script>

<svelte:head>
	<title>Tasks · Admin · Libiamo</title>
	<meta name="description" content="Manage Libiamo tasks.">
</svelte:head>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<h1 class="text-3xl">Tasks</h1>
		<Button href="{base}/admin/tasks/new">New Task</Button>
	</div>

	<!-- Filters -->
	<form method="GET" class="flex flex-wrap gap-3" onchange={submitFilters}>
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
	</form>

	<!-- Table -->
	<Table.Root>
		<Table.Header>
			<Table.Row>
				<Table.Head>ID</Table.Head>
				<Table.Head>Title</Table.Head>
				<Table.Head>Language</Table.Head>
				<Table.Head>Type</Table.Head>
				<Table.Head>UI Variant</Table.Head>
				<Table.Head>Rotation</Table.Head>
				<Table.Head>Tags</Table.Head>
				<Table.Head>Active</Table.Head>
				<Table.Head>Actions</Table.Head>
			</Table.Row>
		</Table.Header>
		<Table.Body>
			{#each data.tasks as item}
				<Table.Row>
					<Table.Cell>{item.id}</Table.Cell>
					<Table.Cell class="title-cell"> <span class="title" title={item.title}>{item.title}</span> </Table.Cell>
					<Table.Cell><Badge variant="outline">{item.language.toUpperCase()}</Badge></Table.Cell>
					<Table.Cell>{INTERACTION_TYPE_LABELS[item.interactionType]}</Table.Cell>
					<Table.Cell>{UI_VARIANT_LABELS[item.ui]}</Table.Cell>
					<Table.Cell>{item.rotation ? LINEUP_KIND_LABELS[item.rotation] : "—"}</Table.Cell>
					<Table.Cell class="text-xs text-muted-foreground">
						<span class="block w-28 truncate" title={item.tags?.join(", ")}>{item.tags?.join(", ") ?? ""}</span>
					</Table.Cell>
					<Table.Cell>
						<span class="rounded-full px-2 py-0.5 text-xs {item.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}">
							{item.isActive ? 'Active' : 'Inactive'}
						</span>
					</Table.Cell>
					<Table.Cell> <a href="{base}/admin/tasks/{item.id}" class="text-sm text-muted-foreground hover:underline">Edit</a> </Table.Cell>
				</Table.Row>
			{/each}
		</Table.Body>
	</Table.Root>

	{#if data.tasks.length === 0}
		<p class="text-center text-muted-foreground">No tasks found.</p>
	{/if}
</div>

<style>
/* A clipped title unfolds rightwards over its neighbours while hovered, then folds back. */
:global(.title-cell) {
	position: relative;
	width: 14rem;
	max-width: 14rem;
}

.title {
	display: block;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	border-radius: var(--radius-md);
}

/* Out of flow while open, so the column keeps its width and the row its height. */
.title:hover {
	position: absolute;
	top: 50%;
	left: 0;
	z-index: 2;
	width: max-content;
	max-width: 40rem;
	padding: 0.25rem 0.5rem;
	translate: 0 -50%;
	background: var(--background);
	box-shadow:
		0 0 0 1px var(--border),
		0 4px 14px color-mix(in oklab, var(--foreground) 10%, transparent);
	animation: title-unfold 180ms ease-out;
}

@keyframes title-unfold {
	from {
		clip-path: inset(0 calc(100% - 14rem) 0 0);
	}
	to {
		clip-path: inset(0 0 0 0);
	}
}

@media (prefers-reduced-motion: reduce) {
	.title:hover {
		animation: none;
	}
}
</style>
