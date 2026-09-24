<script lang="ts">
import { base } from "$app/paths";
import { page } from "$app/state";
import { parseTaskJson } from "$lib/admin/task-actions";
import { focusAndHighlightField } from "$lib/client/form-attention";
import ActionNotification from "$lib/components/ActionNotification.svelte";
import TaskForm, { type TaskFormData } from "$lib/components/TaskForm.svelte";
import { Badge } from "$lib/components/ui/badge";
import { Button } from "$lib/components/ui/button";
import { Textarea } from "$lib/components/ui/textarea";
import { getDisplayClock } from "$lib/display-clock";
import { TASK_JSON_VERSION } from "$lib/schemas";

const clock = getDisplayClock();

let { data, form } = $props();

let success = $derived(page.url.searchParams.get("success") === "1");
let importJsonText = $state("");
let importInput: HTMLTextAreaElement | null = $state(null);
let importFeedback = $state<string | null>(null);
let importedTask = $state<TaskFormData | undefined>(undefined);
let importResetKey = $state("empty");
const importPlaceholder = `{"version":${TASK_JSON_VERSION},"task":{...}}`;
const actionNotification = $derived(
	success
		? {
				variant: "success" as const,
				title: "Task submitted",
				message: "Your task has been submitted for review. Thanks for your contribution!",
			}
		: null,
);

function formatDate(d: Date | null): string {
	if (!d) return "";
	return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: clock().timeZone });
}

function fillFromJson() {
	const result = parseTaskJson(importJsonText);
	if (!result.success) {
		if (importInput) focusAndHighlightField(importInput, result.error);
		importFeedback = null;
		return;
	}

	importedTask = result.data.task;
	importResetKey = `import-${Date.now()}`;
	importFeedback = "Editor filled from JSON. Review the fields, make any edits, then submit for review.";
}
</script>

<svelte:head>
	<title>Contribute · Libiamo</title>
	<meta name="description" content="Contribute new language-learning tasks and scenario ideas to Libiamo.">
</svelte:head>

<div class="space-y-10">
	<h1 class="text-3xl text-gray-800 font-medium">Contribute a Task</h1>

	<ActionNotification notification={actionNotification} />

	{#if success}
		<div class="rounded-md border border-border bg-card p-4 space-y-2">
			<p class="text-sm text-muted-foreground">An admin will review your task soon.</p>
			<a href="{base}/" class="inline-block text-sm font-medium text-foreground underline underline-offset-2 hover:text-muted-foreground">
				&larr; Back to Quests
			</a>
		</div>
	{:else}
		<p class="text-muted-foreground">Propose a new learning scenario. Your submission will be reviewed by an admin before it goes live.</p>

		<details class="rounded-md border border-input bg-background p-4">
			<summary class="cursor-pointer text-sm font-medium">Import JSON</summary>
			<div class="mt-4 space-y-3">
				<p class="text-sm text-muted-foreground">
					Paste exported task JSON to fill the editor. You can edit everything before submitting for review.
				</p>
				<Textarea bind:ref={importInput} bind:value={importJsonText} rows={8} placeholder={importPlaceholder} aria-label="Task JSON" />
				{#if importFeedback}
					<p class="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{importFeedback}</p>
				{/if}
				<Button type="button" variant="secondary" onclick={fillFromJson}>Fill editor from JSON</Button>
			</div>
		</details>

		{#key importResetKey}
			<TaskForm
				task={importedTask}
				{form}
				submitLabel="Submit for Review"
				cancelHref="{base}/"
				hideAdminFields
				confirmBeforeSubmit
				resetKey={importResetKey}
			/>
		{/key}
	{/if}

	<!-- Contribution History -->
	{#if data.contributions && data.contributions.length > 0}
		<div class="space-y-4">
			<h2 class="text-xl text-gray-800 font-medium">Your Contributions</h2>
			<div class="space-y-3">
				{#each data.contributions as c}
					<div class="flex items-center justify-between rounded-md border border-border p-3">
						<div class="min-w-0 flex-1">
							<p class="text-sm truncate">{c.title}</p>
							<p class="text-xs text-muted-foreground">{c.interactionType} &middot; {c.ui} &middot; {formatDate(c.submittedAt)}</p>
							{#if c.status === "rejected" && c.reviewNotes}
								<p class="text-xs text-red-600 mt-1">Reason: {c.reviewNotes}</p>
							{/if}
						</div>
						<div class="ml-4 shrink-0">
							{#if c.status === "approved"}
								<Badge variant="outline" class="bg-green-100 text-green-700 border-green-200">Approved</Badge>
							{:else if c.status === "rejected"}
								<Badge variant="outline" class="bg-red-100 text-red-700 border-red-200">Rejected</Badge>
							{:else}
								<Badge variant="outline" class="bg-yellow-100 text-yellow-700 border-yellow-200">Pending</Badge>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>
