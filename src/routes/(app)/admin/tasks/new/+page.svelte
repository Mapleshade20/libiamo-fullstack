<script lang="ts">
import { enhance } from "$app/forms";
import { parseTaskJson } from "$lib/admin/task-actions";
import { focusAndHighlightField } from "$lib/client/form-attention";
import TaskForm, { type TaskFormData } from "$lib/components/admin/TaskForm.svelte";
import Accordion from "$lib/components/common/Accordion.svelte";
import ActionNotification from "$lib/components/common/ActionNotification.svelte";
import { Button } from "$lib/components/ui/button";
import { Textarea } from "$lib/components/ui/textarea";
import { TASK_CONTRIBUTION_FIELDS, TASK_JSON_VERSION } from "$lib/schemas";

let { data, form } = $props();

const importPlaceholder = `{"version":${TASK_JSON_VERSION},"task":{...}}`;

// Pre-fill from contribution
let contributed = $derived(data?.contributionData);
let taskData = $derived<TaskFormData | undefined>(
	contributed ? Object.fromEntries(TASK_CONTRIBUTION_FIELDS.map((field) => [field, contributed[field]])) : undefined,
);
let importNotification = $derived(
	form && "message" in form && form.message && !("errors" in form)
		? { variant: "error" as const, title: "Unable to create task", message: form.message as string }
		: null,
);
</script>

<svelte:head>
	<title>New task · Admin · Libiamo</title>
	<meta name="description" content="Create a new Libiamo task.">
</svelte:head>

<div class="space-y-6">
	<h1>{contributed ? "Review contribution" : "New task"}</h1>

	{#if contributed}
		<p class="text-sm text-muted-foreground">Reviewing contribution #{contributed.id}. Adjust fields below, then create to approve.</p>
	{/if}

	<ActionNotification notification={importNotification} />

	{#if !contributed}
		<Accordion title="Import JSON">
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
				class="space-y-2"
			>
				<label for="task-json" class="block text-sm text-muted-foreground">Paste an exported task JSON file to create a new task.</label>
				<Textarea
					id="task-json"
					class="h-40 field-sizing-fixed resize-y font-mono text-xs"
					name="taskJson"
					rows={10}
					placeholder={importPlaceholder}
					required
				/>
				<Button type="submit" variant="secondary">Import JSON</Button>
			</form>
		</Accordion>
	{/if}

	<TaskForm
		task={taskData}
		action="?/create"
		form={form && "errors" in form ? form : null}
		submitLabel={contributed ? "Create and approve" : "Create task"}
		extraHiddenFields={contributed ? { fromContributionId: String(contributed.id) } : undefined}
	/>

	{#if contributed}
		<p class="text-xs text-muted-foreground">After creation, contribution #{contributed.id} will be automatically marked as approved.</p>
	{/if}
</div>
