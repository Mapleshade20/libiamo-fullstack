<script lang="ts">
import { enhance } from "$app/forms";
import { parseTaskJson } from "$lib/admin/task-actions";
import { focusAndHighlightField } from "$lib/client/form-attention";
import ActionNotification from "$lib/components/ActionNotification.svelte";
import TaskForm, { type TaskFormData } from "$lib/components/TaskForm.svelte";
import { Button } from "$lib/components/ui/button";
import { Textarea } from "$lib/components/ui/textarea";
import { TASK_JSON_VERSION } from "$lib/schemas";

let { data, form } = $props();

const importPlaceholder = `{"version":${TASK_JSON_VERSION},"task":{...}}`;

// Pre-fill from contribution
let contributed = $derived(data?.contributionData);
let taskData = $derived<TaskFormData | undefined>(
	contributed
		? {
				language: contributed.language,
				interactionType: contributed.interactionType,
				ui: contributed.ui,
				urgency: contributed.urgency,
				title: contributed.title,
				shortObjective: contributed.shortObjective,
				description: contributed.description,
				agentPrompt: contributed.agentPrompt,
				materialsMd: contributed.materialsMd,
				objectives: contributed.objectives,
				tags: contributed.tags,
				openingState: contributed.openingState,
				referenceParagraphs: contributed.referenceParagraphs,
				translationContext: contributed.translationContext,
			}
		: undefined,
);
let importNotification = $derived(
	form && "message" in form && form.message && !("errors" in form)
		? { variant: "error" as const, title: "Unable to create task", message: form.message as string }
		: null,
);
</script>

<svelte:head>
	<title>New Task · Admin · Libiamo</title>
	<meta name="description" content="Create a new Libiamo task.">
</svelte:head>

<div class="space-y-6">
	<h1 class="text-3xl">
		{#if contributed}
			Edit &amp; Approve Contribution
		{:else}
			New Task
		{/if}
	</h1>

	{#if contributed}
		<p class="text-muted-foreground">Reviewing contribution #{contributed.id}. Adjust fields below, then create to approve.</p>
	{/if}

	<ActionNotification notification={importNotification} />

	{#if !contributed}
		<details class="rounded-md border border-input bg-background p-4">
			<summary class="cursor-pointer text-sm font-medium">Import JSON</summary>
			<form
				method="POST"
				action="?/importJson"
				use:enhance={({ cancel, formElement, formData }) => {
				const result = parseTaskJson(String(formData.get("taskJson") ?? ""));
				if (!result.success) {
					cancel();
					const input = formElement.querySelector<HTMLTextAreaElement>('[name="taskJson"]');
					if (input) focusAndHighlightField(input, result.error);
					return;
				}
				return async ({ update }) => update({ reset: false });
			}}
				class="mt-4 space-y-3"
			>
				<p class="text-sm text-muted-foreground">Paste an exported task JSON file to create a new task.</p>
				<Textarea name="taskJson" rows={10} placeholder={importPlaceholder} required />
				<Button type="submit" variant="secondary">Import JSON</Button>
			</form>
		</details>
	{/if}

	<TaskForm
		task={taskData}
		action="?/create"
		form={form && "errors" in form ? form : null}
		submitLabel={contributed ? "Create & Approve" : "Create Task"}
		extraHiddenFields={contributed ? { fromContributionId: String(contributed.id) } : undefined}
	/>

	{#if contributed}
		<p class="mt-4 text-xs text-muted-foreground">After creation, contribution #{contributed.id} will be automatically marked as approved.</p>
	{/if}
</div>
