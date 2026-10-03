<script lang="ts">
import ArrowLeft from "@lucide/svelte/icons/arrow-left";
import { base } from "$app/paths";
import { page } from "$app/state";
import { parseTaskJson } from "$lib/admin/task-actions";
import { focusAndHighlightField } from "$lib/client/form-attention";
import TaskForm, { type TaskFormData } from "$lib/components/admin/TaskForm.svelte";
import Accordion from "$lib/components/common/Accordion.svelte";
import ActionNotification from "$lib/components/common/ActionNotification.svelte";
import Notice from "$lib/components/common/Notice.svelte";
import { Badge } from "$lib/components/ui/badge";
import { Button } from "$lib/components/ui/button";
import { Textarea } from "$lib/components/ui/textarea";
import { TASK_JSON_VERSION } from "$lib/schemas";
import { getDisplayClock } from "$lib/time/display-clock";

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
	<h1>Contribute a task</h1>

	<ActionNotification notification={actionNotification} />

	{#if success}
		<Notice tone="success" role="status">
			<p>An admin will review your task soon.</p>
			<Button href="{base}/" variant="secondary" size="sm" class="mt-2"><ArrowLeft aria-hidden="true" />Back to quests</Button>
		</Notice>
	{:else}
		<p class="text-sm text-muted-foreground">Propose a new learning scenario. Your submission will be reviewed by an admin before it goes live.</p>

		<Accordion title="Import JSON">
			<div class="space-y-3">
				<p class="text-sm text-muted-foreground">
					Paste exported task JSON to fill the editor. You can edit everything before submitting for review.
				</p>
				<Textarea
					class="h-40 field-sizing-fixed resize-y font-mono text-xs"
					bind:ref={importInput}
					bind:value={importJsonText}
					rows={8}
					placeholder={importPlaceholder}
					aria-label="Task JSON"
				/>
				{#if importFeedback}
					<Notice tone="success" role="status"><p>{importFeedback}</p></Notice>
				{/if}
				<Button type="button" variant="secondary" onclick={fillFromJson}>Fill editor from JSON</Button>
			</div>
		</Accordion>

		{#key importResetKey}
			<TaskForm
				task={importedTask}
				{form}
				submitLabel="Submit for review"
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
			<h2>Your contributions</h2>
			<div class="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
				{#each data.contributions as c}
					<div class="flex items-center justify-between gap-4 px-4 py-3">
						<div class="min-w-0 flex-1">
							<p class="truncate text-sm font-medium">{c.title}</p>
							<p class="text-xs text-muted-foreground">{c.interactionType} &middot; {c.ui} &middot; {formatDate(c.submittedAt)}</p>
							{#if c.status === "rejected" && c.reviewNotes}
								<p class="mt-1 text-xs text-destructive">Reason: {c.reviewNotes}</p>
							{/if}
						</div>
						<div class="shrink-0">
							{#if c.status === "approved"}
								<Badge variant="success">Approved</Badge>
							{:else if c.status === "rejected"}
								<Badge variant="destructive">Rejected</Badge>
							{:else}
								<Badge variant="warning">Pending</Badge>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>
