<script lang="ts">
import { untrack } from "svelte";
import { enhance } from "$app/forms";
import { base } from "$app/paths";
import ActionNotification from "$lib/components/common/ActionNotification.svelte";
import ConfirmDialog from "$lib/components/common/ConfirmDialog.svelte";
import type { ActionNotificationContent } from "$lib/components/common/notifications";
import { formatLabTime, formatLatency, ORIGIN_LABELS } from "$lib/components/llm/format";
import { Badge } from "$lib/components/ui/badge";
import * as Table from "$lib/components/ui/table";
import { getDisplayClock } from "$lib/time/display-clock";

let { data, form } = $props();
const clock = getDisplayClock();
const recipeTitles = $derived(new Map(data.recipes.map((recipe) => [recipe.id, recipe.title])));

// Run outputs belong to their run and can only be deleted with it.
const selectable = $derived(data.traces.filter((trace) => trace.runId === null).map((trace) => trace.id));
let selected = $state<string[]>([]);
/** The whole filtered view, not just this page, is selected. */
let allMatching = $state(false);
let confirmOpen = $state(false);
let deleting = $state(false);
let deleteForm: HTMLFormElement | null = $state(null);
let resultKey = $state(0);

$effect(() => {
	// A new page of rows (filters, paging, or a finished delete) starts a fresh selection.
	void data.traces;
	untrack(() => {
		selected = [];
		allMatching = false;
	});
});

const pageSelected = $derived(selectable.length > 0 && selectable.every((id) => selected.includes(id)));
const selectionCount = $derived(allMatching && data.matching ? data.matching.deletable : selected.length);
const canSelectMatching = $derived(!allMatching && pageSelected && data.matching !== null && data.matching.deletable > selectable.length);
const filterFields = $derived(
	Object.entries({
		recipe: data.filters.recipeId,
		user: data.filters.userId,
		task: data.filters.taskId,
		origin: data.filters.origin,
		status: data.filters.status,
	}).filter(([, value]) => value !== undefined && value !== ""),
);

function toggle(id: string, checked: boolean) {
	allMatching = false;
	selected = checked ? [...selected, id] : selected.filter((candidate) => candidate !== id);
}

function togglePage(checked: boolean) {
	allMatching = false;
	selected = checked ? [...selectable] : [];
}

function plural(count: number, word: string) {
	return `${count} ${word}${count === 1 ? "" : "s"}`;
}

const notification = $derived.by((): ActionNotificationContent | null => {
	if (form?.deleteError) return { variant: "error", message: form.deleteError, key: resultKey };
	const result = form?.deleteResult;
	if (!result) return null;
	const kept = result.keptInRuns ? ` ${plural(result.keptInRuns, "run trace")} stayed with their runs; delete the run to remove them.` : "";
	return { variant: "success", message: `Deleted ${plural(result.deleted, "trace")}.${kept}`, key: resultKey };
});

function olderHref(): string {
	const params = new URLSearchParams();
	for (const [key, value] of Object.entries({
		recipe: data.filters.recipeId,
		user: data.filters.userId,
		task: data.filters.taskId,
		origin: data.filters.origin,
		status: data.filters.status,
	})) {
		if (value !== undefined && value !== "") params.set(key, String(value));
	}
	const last = data.traces.at(-1);
	if (last) params.set("before", new Date(last.createdAt).toISOString());
	return `${base}/admin/lab/traces?${params}`;
}

const buttonClass =
	"inline-flex min-h-11 items-center rounded-md border border-border px-4 text-sm hover:bg-secondary focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50";
const selectClass =
	"h-11 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
</script>

<svelte:head> <title>LLM Lab · Admin · Libiamo</title> </svelte:head>

<div class="space-y-6">
	<div class="space-y-1">
		<h1 class="text-3xl">LLM Lab</h1>
		<p class="text-sm text-muted-foreground">
			Captured real-flow calls, plus Lab runs. Real-flow traces are kept for 30 days; pin cases to a dataset to keep them.
		</p>
	</div>

	<form method="GET" class="flex flex-wrap items-end gap-3" aria-label="Filter traces">
		<label class="grid gap-1 text-xs text-muted-foreground">
			Recipe
			<select name="recipe" class={selectClass} value={data.filters.recipeId ?? ""}>
				<option value="">All recipes</option>
				{#each data.recipes as recipe}
					<option value={recipe.id}>{recipe.title}</option>
				{/each}
			</select>
		</label>
		<label class="grid gap-1 text-xs text-muted-foreground">
			Origin
			<select name="origin" class={selectClass} value={data.filters.origin ?? ""}>
				<option value="">Any origin</option>
				<option value="app">Real flow</option>
				<option value="override">Override</option>
				<option value="lab">Lab</option>
			</select>
		</label>
		<label class="grid gap-1 text-xs text-muted-foreground">
			Status
			<select name="status" class={selectClass} value={data.filters.status ?? ""}>
				<option value="">Any status</option>
				<option value="ok">OK</option>
				<option value="error">Error</option>
			</select>
		</label>
		<label class="grid gap-1 text-xs text-muted-foreground">
			Task id
			<input name="task" inputmode="numeric" class="{selectClass} w-28" value={data.filters.taskId ?? ""}>
		</label>
		{#if data.filters.userId}
			<input type="hidden" name="user" value={data.filters.userId}>
		{/if}
		<button
			type="submit"
			class="h-11 rounded-md border border-border px-4 text-sm hover:bg-secondary focus-visible:outline-2 focus-visible:outline-ring"
		>
			Filter
		</button>
		{#if data.filters.userId}
			<a href="{base}/admin/lab/traces" class="inline-flex min-h-11 items-center text-sm text-muted-foreground underline underline-offset-2"
				>Clear user filter</a
			>
		{/if}
	</form>

	{#if data.traces.length === 0}
		<p class="text-muted-foreground">
			No traces match. Real-flow calls appear here unless a learner on their own API key turned capture off in their profile.
		</p>
	{:else}
		<div class="flex min-h-11 flex-wrap items-center gap-x-4 gap-y-2 text-sm" aria-live="polite">
			<span class="text-muted-foreground">
				{#if allMatching}
					All {plural(selectionCount, "matching trace")} selected
					{#if data.matching?.inRuns}
						; {plural(data.matching.inRuns, "run trace")} stay with their runs
					{/if}
					.
				{:else if selected.length}
					{plural(selected.length, "trace")}
					selected on this page.
				{:else}
					Select traces to delete them.
				{/if}
			</span>
			{#if canSelectMatching}
				<button type="button" class="min-h-11 text-sm underline underline-offset-2" onclick={() => (allMatching = true)}>
					Select all {plural(data.matching?.deletable ?? 0, "matching trace")}
				</button>
			{:else if allMatching}
				<button type="button" class="min-h-11 text-sm underline underline-offset-2" onclick={() => (allMatching = false)}>Only this page</button>
			{/if}
			<button
				type="button"
				class="{buttonClass} ml-auto text-destructive"
				disabled={selectionCount === 0 || deleting}
				onclick={() => (confirmOpen = true)}
			>
				Delete selected
			</button>
		</div>

		<form
			bind:this={deleteForm}
			method="POST"
			action="?/delete"
			hidden
			use:enhance={() => {
				deleting = true;
				return async ({ update }) => {
					try {
						await update({ reset: false });
					} finally {
						deleting = false;
						confirmOpen = false;
						resultKey += 1;
					}
				};
			}}
		>
			{#if allMatching}
				<input type="hidden" name="scope" value="matching">
				{#each filterFields as [ name, value ]}
					<input type="hidden" {name} value={String(value)}>
				{/each}
			{:else}
				{#each selected as id}
					<input type="hidden" name="id" value={id}>
				{/each}
			{/if}
		</form>

		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head class="w-11 px-0">
						<label class="flex size-11 cursor-pointer items-center justify-center">
							<input
								type="checkbox"
								class="size-4 accent-foreground"
								aria-label="Select every deletable trace on this page"
								checked={pageSelected}
								indeterminate={!pageSelected && selected.length > 0}
								disabled={selectable.length === 0}
								onchange={(event) => togglePage(event.currentTarget.checked)}
							>
						</label>
					</Table.Head>
					<Table.Head>Time</Table.Head>
					<Table.Head>Recipe</Table.Head>
					<Table.Head>Origin</Table.Head>
					<Table.Head>User</Table.Head>
					<Table.Head>Task</Table.Head>
					<Table.Head>Model</Table.Head>
					<Table.Head class="text-right">Latency</Table.Head>
					<Table.Head class="text-right">Out tokens</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each data.traces as trace (trace.id)}
					<Table.Row data-state={allMatching || selected.includes(trace.id) ? "selected" : undefined}>
						<Table.Cell class="w-11 px-0">
							<label
								class="flex size-11 items-center justify-center {trace.runId === null ? 'cursor-pointer' : 'cursor-not-allowed'}"
								title={trace.runId === null ? undefined : `Part of run #${trace.runId}; delete the run to remove it`}
							>
								<input
									type="checkbox"
									class="size-4 accent-foreground"
									aria-label="Select this trace"
									checked={trace.runId === null && (allMatching || selected.includes(trace.id))}
									disabled={trace.runId !== null}
									onchange={(event) => toggle(trace.id, event.currentTarget.checked)}
								>
							</label>
						</Table.Cell>
						<Table.Cell class="whitespace-nowrap text-xs text-muted-foreground tabular-nums"
							>{formatLabTime(trace.createdAt, clock().timeZone)}</Table.Cell
						>
						<Table.Cell>
							<a href="{base}/admin/lab/traces/{trace.id}" class="font-medium hover:underline"
								>{recipeTitles.get(trace.recipeId) ?? trace.recipeId}</a
							>
							{#if trace.status === "error"}
								<Badge variant="outline" class="ml-2 border-[#e3c4bd] text-[#7d2f22]">error</Badge>
							{/if}
							{#if trace.attemptCount > 1}
								<Badge variant="outline" class="ml-2">repaired</Badge>
							{/if}
						</Table.Cell>
						<Table.Cell class="text-xs">
							{ORIGIN_LABELS[trace.origin]}
							{#if trace.variant?.label}
								<span class="text-muted-foreground"> · {trace.variant.label}</span>
							{/if}
						</Table.Cell>
						<Table.Cell class="text-xs">
							{#if trace.userId}
								<a href="{base}/admin/lab/traces?user={encodeURIComponent(trace.userId)}" class="hover:underline" title={trace.userEmail ?? ""}
									>{trace.userName ?? trace.userId}</a
								>
							{:else}
								<span class="text-muted-foreground">—</span>
							{/if}
						</Table.Cell>
						<Table.Cell class="text-xs tabular-nums">
							{#if trace.taskId}
								<a href="{base}/admin/lab/traces?task={trace.taskId}" class="hover:underline">#{trace.taskId}</a>
							{:else}
								—
							{/if}
						</Table.Cell>
						<Table.Cell class="max-w-40 truncate text-xs text-muted-foreground" title={trace.route?.host ?? ""}
							>{trace.route?.model ?? "—"}</Table.Cell
						>
						<Table.Cell class="text-right text-xs tabular-nums">{formatLatency(trace.latencyMs)}</Table.Cell>
						<Table.Cell class="text-right text-xs tabular-nums">{trace.completionTokens ?? "—"}</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
		{#if data.hasMore}
			<a href={olderHref()} class="inline-flex min-h-11 items-center text-sm underline underline-offset-2">Older traces</a>
		{/if}
	{/if}
</div>

<ConfirmDialog
	bind:open={confirmOpen}
	busy={deleting}
	title={`Delete ${plural(selectionCount, "trace")}?`}
	message="Their ratings are deleted with them. Dataset cases pinned from them keep their input. This cannot be undone."
	confirmLabel="Delete"
	cancelLabel="Cancel"
	onconfirm={() => deleteForm?.requestSubmit()}
/>
<ActionNotification {notification} />
