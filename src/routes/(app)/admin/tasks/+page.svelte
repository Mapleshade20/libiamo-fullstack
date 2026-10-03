<script lang="ts">
import { base } from "$app/paths";
import Select from "$lib/components/common/Select.svelte";
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
	<div class="flex flex-wrap items-center justify-between gap-4">
		<h1>Tasks</h1>
		<Button href="{base}/admin/tasks/new">New task</Button>
	</div>

	<form method="GET" class="flex flex-wrap gap-2" onchange={submitFilters} aria-label="Filter tasks">
		<Select
			name="language"
			aria-label="Language"
			class="w-44"
			value={data.filters.language ?? ""}
			items={[{ value: "", label: "All languages" }, ...LANGUAGE_CODES.map((code) => ({ value: code, label: LANGUAGE_LABELS[code] }))]}
		/>
		<Select
			name="interactionType"
			aria-label="Type"
			class="w-36"
			value={data.filters.interactionType ?? ""}
			items={[{ value: "", label: "All types" }, ...INTERACTION_TYPES.map((type) => ({ value: type, label: INTERACTION_TYPE_LABELS[type] }))]}
		/>
		<Select
			name="active"
			aria-label="Status"
			class="w-44"
			value={data.filters.active ?? ""}
			items={[
				{ value: "", label: "Active and inactive" },
				{ value: "true", label: "Active only" },
				{ value: "false", label: "Inactive only" },
			]}
		/>
	</form>

	<Table.Root>
		<Table.Header>
			<Table.Row>
				<Table.Head>ID</Table.Head>
				<Table.Head>Title</Table.Head>
				<Table.Head>Language</Table.Head>
				<Table.Head>Type</Table.Head>
				<Table.Head>Interface</Table.Head>
				<Table.Head>Rotation</Table.Head>
				<Table.Head>Tags</Table.Head>
				<Table.Head>Status</Table.Head>
				<Table.Head><span class="sr-only">Actions</span></Table.Head>
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
					<Table.Cell> <Badge variant={item.isActive ? "success" : "outline"}>{item.isActive ? "Active" : "Inactive"}</Badge> </Table.Cell>
					<Table.Cell class="py-1 text-right"><Button href="{base}/admin/tasks/{item.id}" variant="ghost" size="sm">Edit</Button></Table.Cell>
				</Table.Row>
			{/each}
		</Table.Body>
	</Table.Root>

	{#if data.tasks.length === 0}
		<p class="py-8 text-center text-sm text-muted-foreground">No tasks found.</p>
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
	left: 0.25rem;
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
