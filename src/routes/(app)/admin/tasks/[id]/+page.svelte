<script lang="ts">
import { enhance } from "$app/forms";
import { buildTaskExport, parseTaskJson } from "$lib/admin/task-actions";
import { focusAndHighlightField } from "$lib/client/form-attention";
import TaskForm from "$lib/components/admin/TaskForm.svelte";
import ActionNotification from "$lib/components/common/ActionNotification.svelte";
import BottomSheet from "$lib/components/ui/bottom-sheet/BottomSheet.svelte";
import { Button } from "$lib/components/ui/button";
import { Textarea } from "$lib/components/ui/textarea";

let { form, data } = $props();

let importFormEl: HTMLFormElement | null = $state(null);
let showImportConfirm = $state(false);
let importConfirmed = $state(false);
let deleteFormEl: HTMLFormElement | null = $state(null);
let showDeleteConfirm = $state(false);
let deleteConfirmed = $state(false);
let statusFormEl: HTMLFormElement | null = $state(null);
let showStatusConfirm = $state(false);
let statusConfirmed = $state(false);

const actionNotification = $derived.by(() => {
	if (form?.action === "importJson" && form.message) return { variant: "error" as const, title: "Unable to import task", message: form.message };
	if (form?.action === "delete" && form.message) return { variant: "error" as const, title: "Unable to delete task", message: form.message };
	if (form?.action === "setActive" && form.message)
		return { variant: "error" as const, title: "Unable to update task status", message: form.message };
	if (form?.saved) return { variant: "success" as const, title: "Task saved", message: "Your task changes have been saved." };
	if (form?.imported) return { variant: "success" as const, title: "Task imported", message: "Task fields were replaced from JSON." };
	if (form?.activated) return { variant: "success" as const, title: "Task activated", message: "This task can be lined up again." };
	if (form?.deactivated) return { variant: "success" as const, title: "Task deactivated", message: "This task will no longer be lined up." };
	return null;
});

const taskExportJson = $derived(JSON.stringify(buildTaskExport(data.task, data.rotation), null, 2));
const exportHref = $derived(`data:application/json;charset=utf-8,${encodeURIComponent(taskExportJson)}`);
const statusLabel = $derived(data.task.isActive ? "Deactivate Task" : "Activate Task");
const saveForm = $derived(form?.action === "save" ? form : null);

function confirmImportJson() {
	importConfirmed = true;
	showImportConfirm = false;
	importFormEl?.requestSubmit();
}

function confirmDeleteTask() {
	deleteConfirmed = true;
	showDeleteConfirm = false;
	deleteFormEl?.requestSubmit();
}

function confirmStatusChange() {
	statusConfirmed = true;
	showStatusConfirm = false;
	statusFormEl?.requestSubmit();
}
</script>

<svelte:head>
	<title>Edit Task #{data.task.id} · Admin · Libiamo</title>
	<meta name="description" content="Edit task content and scenario configuration.">
</svelte:head>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<h1 class="text-3xl">Edit Task #{data.task.id}</h1>
	</div>

	<ActionNotification notification={actionNotification} />

	<details class="rounded-md border border-input bg-background p-4">
		<summary class="cursor-pointer text-sm font-medium">Export / Import JSON</summary>
		<div class="mt-4 grid gap-4 lg:grid-cols-2">
			<div class="space-y-2">
				<p class="text-sm text-muted-foreground">Export this task.</p>
				<Button href={exportHref} download={`task-${data.task.id}.json`} variant="outline">Export JSON</Button>
			</div>

			<form
				method="POST"
				action="?/importJson"
				bind:this={importFormEl}
				use:enhance={({ cancel, formElement, formData }) => {
					if (!importConfirmed) {
						cancel();
						const result = parseTaskJson(String(formData.get("taskJson") ?? ""));
						if (!result.success) {
							const input = formElement.querySelector<HTMLTextAreaElement>('[name="taskJson"]');
							if (input) focusAndHighlightField(input, result.error);
							return;
						}
						showImportConfirm = true;
						return;
					}

					importConfirmed = false;
					return async ({ update }) => update({ reset: false });
				}}
				class="space-y-2"
			>
				<p class="text-sm text-muted-foreground">Paste exported JSON to replace this task's fields in place.</p>
				<Textarea name="taskJson" rows={8} placeholder={taskExportJson} required />
				<Button type="submit" variant="secondary">Import JSON</Button>
			</form>
		</div>
	</details>

	<TaskForm
		task={{ ...data.task, rotation: data.rotation }}
		form={saveForm}
		action="?/save"
		submitLabel="Save Changes"
		resetKey={`${data.task.updatedAt}:${data.rotation}`}
	/>

	<div class="grid gap-4 lg:grid-cols-2">
		<section class="rounded-md border border-input bg-muted/20 p-4">
			<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<div class="space-y-1">
					<h2 class="text-sm font-medium">{statusLabel}</h2>
					<p class="text-sm text-muted-foreground">
						{data.task.isActive ? "Stop lining this task up for learners." : "Make this task available for lineups again."}
					</p>
				</div>
				<form
					method="POST"
					action="?/setActive"
					bind:this={statusFormEl}
					use:enhance={({ cancel }) => {
						if (!statusConfirmed) {
							cancel();
							showStatusConfirm = true;
							return;
						}

						statusConfirmed = false;
						return async ({ update }) => update({ reset: false });
					}}
				>
					<input type="hidden" name="isActive" value={String(!data.task.isActive)}>
					<Button type="submit" variant={data.task.isActive ? "destructive" : "default"}>{statusLabel}</Button>
				</form>
			</div>
		</section>

		<section class="rounded-md border border-destructive/20 bg-destructive/5 p-4">
			<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<div class="space-y-1">
					<h2 class="text-sm font-medium text-destructive">Delete Task</h2>
					<p class="text-sm text-muted-foreground">Remove this task if no learner has worked on it.</p>
				</div>
				<form
					method="POST"
					action="?/delete"
					bind:this={deleteFormEl}
					use:enhance={({ cancel }) => {
						if (!deleteConfirmed) {
							cancel();
							showDeleteConfirm = true;
							return;
						}

						deleteConfirmed = false;
						return async ({ update }) => update({ reset: false });
					}}
				>
					<Button type="submit" variant="destructive">Delete Task</Button>
				</form>
			</div>
		</section>
	</div>
</div>

<BottomSheet
	show={showImportConfirm}
	title="Replace Task From JSON?"
	confirmLabel="Import JSON"
	cancelLabel="Cancel"
	onConfirm={confirmImportJson}
	onCancel={() => { showImportConfirm = false; }}
>
	{#snippet children()}
		<div class="space-y-3 text-sm text-muted-foreground">
			<p>Every field of task #{data.task.id} will be replaced by the pasted JSON, including its active status and auto rotation.</p>
			<p>Learners see the change immediately, including in conversations already under way.</p>
		</div>
	{/snippet}
</BottomSheet>

<BottomSheet
	show={showStatusConfirm}
	title={`${statusLabel}?`}
	confirmLabel={statusLabel}
	cancelLabel="Cancel"
	onConfirm={confirmStatusChange}
	onCancel={() => { showStatusConfirm = false; }}
>
	{#snippet children()}
		<div class="space-y-3 text-sm text-muted-foreground">
			{#if data.task.isActive}
				<p>Task #{data.task.id} will no longer be picked for new lineups or listed among translations.</p>
				<p>Lineups it already appears in, and learner history, remain unchanged.</p>
			{:else}
				<p>Task #{data.task.id} will become available for new lineups again.</p>
			{/if}
		</div>
	{/snippet}
</BottomSheet>

<BottomSheet
	show={showDeleteConfirm}
	title="Delete Task?"
	confirmLabel="Delete Task"
	cancelLabel="Cancel"
	onConfirm={confirmDeleteTask}
	onCancel={() => { showDeleteConfirm = false; }}
>
	{#snippet children()}
		<div class="space-y-3 text-sm text-muted-foreground">
			<p>Task #{data.task.id} will be permanently removed, together with its lineup entries, if no learner has worked on it.</p>
			<p>Used tasks are blocked by the server and can be deactivated instead.</p>
		</div>
	{/snippet}
</BottomSheet>
