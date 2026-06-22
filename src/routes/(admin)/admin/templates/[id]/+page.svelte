<script lang="ts">
import { enhance } from "$app/forms";
import { buildTemplateImportPreview } from "$lib/admin/template-import-preview";
import ActionNotification from "$lib/components/ActionNotification.svelte";
import TemplateForm from "$lib/components/TemplateForm.svelte";
import BottomSheet from "$lib/components/ui/bottom-sheet/BottomSheet.svelte";
import { Button } from "$lib/components/ui/button";
import { Textarea } from "$lib/components/ui/textarea";

let { form, data } = $props();

let importFormEl: HTMLFormElement | null = $state(null);
let importJsonText = $state("");
let showImportPreview = $state(false);
let importConfirmed = $state(false);
let importPreview = $state<ReturnType<typeof buildTemplateImportPreview> | null>(null);

const actionNotification = $derived(
	form?.message
		? { variant: "error" as const, title: "Unable to import template", message: form.message }
		: form?.saved
			? { variant: "success" as const, title: "Template saved", message: "Your template changes have been saved." }
			: form?.imported
				? { variant: "success" as const, title: "Template imported", message: "Template fields and variants were updated from JSON." }
				: null,
);

const existingImportVariants = $derived(data.variants.map((variant) => ({ id: variant.id, slotValues: variant.slotValues })));
const importPreviewItems = $derived(importPreview?.ok ? importPreview.items : []);
const importPreviewError = $derived(importPreview && !importPreview.ok ? importPreview.error : null);
const canConfirmImport = $derived(importPreview?.ok === true);

const templateExportJson = $derived(
	JSON.stringify(
		{
			version: 1,
			template: {
				language: data.template.language,
				interactionType: data.template.interactionType,
				ui: data.template.ui,
				cadence: data.template.cadence,
				difficulty: data.template.difficulty,
				maxTurns: data.template.maxTurns,
				estimatedWords: data.template.estimatedWords,
				pointReward: data.template.pointReward,
				gemReward: data.template.gemReward,
				isActive: data.template.isActive,
				agentStartsFirst: data.template.agentStartsFirst,
				titleBase: data.template.titleBase,
				shortObjectiveBase: data.template.shortObjectiveBase,
				descriptionBase: data.template.descriptionBase,
				agentPromptBase: data.template.agentPromptBase,
				materialsMd: data.template.materialsMd,
				objectivesBase: data.template.objectivesBase,
				translationBase: data.template.translationBase,
				tags: data.template.tags,
			},
			variants:
				data.template.interactionType === "translate"
					? []
					: data.variants.map((variant) => ({
							id: variant.id,
							isActive: variant.isActive,
							slotValues: variant.slotValues,
							openingState: variant.openingState,
						})),
		},
		null,
		2,
	),
);

const exportHref = $derived(`data:application/json;charset=utf-8,${encodeURIComponent(templateExportJson)}`);

function previewImportJson() {
	importPreview = buildTemplateImportPreview(importJsonText, existingImportVariants);
	showImportPreview = true;
}

function confirmImportJson() {
	if (!canConfirmImport) return;
	importConfirmed = true;
	showImportPreview = false;
	importFormEl?.requestSubmit();
}

function statusClass(status: "Edited" | "Created" | "Deactivated") {
	if (status === "Created") return "border-green-200 bg-green-50 text-green-700";
	if (status === "Deactivated") return "border-amber-200 bg-amber-50 text-amber-700";
	return "border-blue-200 bg-blue-50 text-blue-700";
}
</script>

<svelte:head>
	<title>Edit Template #{data.template.id} · Admin · Libiamo</title>
	<meta name="description" content="Edit template content, variants, and scenario configuration.">
</svelte:head>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<h1>Edit Template #{data.template.id}</h1>
	</div>

	<ActionNotification notification={actionNotification} />

	<details class="rounded-md border border-input bg-background p-4">
		<summary class="cursor-pointer text-sm font-medium">Export / Import JSON</summary>
		<div class="mt-4 grid gap-4 lg:grid-cols-2">
			<div class="space-y-2">
				<p class="text-sm text-muted-foreground">Export this template and its variants for another environment.</p>
				<Button href={exportHref} download={`template-${data.template.id}.json`} variant="outline">Export JSON</Button>
			</div>

			<form
				method="POST"
				action="?/importJson"
				bind:this={importFormEl}
				use:enhance={({ cancel }) => {
					if (!importConfirmed) {
						cancel();
						previewImportJson();
						return;
					}

					importConfirmed = false;
					return async ({ update }) => update({ reset: false });
				}}
				class="space-y-2"
			>
				<p class="text-sm text-muted-foreground">
					Paste exported JSON to update this template in-place. Variants with ids are updated, id-less variants are added, and omitted variants are
					deactivated.
				</p>
				<Textarea name="templateJson" rows={8} placeholder={templateExportJson} bind:value={importJsonText} required />
				<Button type="submit" variant="secondary">Import JSON</Button>
			</form>
		</div>
	</details>

	<TemplateForm
		template={data.template}
		variants={data.variants}
		{form}
		action="?/save"
		submitLabel="Save Changes"
		resetKey={String(data.template.updatedAt ?? data.template.id)}
	/>
</div>

<BottomSheet
	show={showImportPreview}
	title={canConfirmImport ? "Preview JSON Import" : "Import JSON Needs Changes"}
	confirmLabel="Import JSON"
	confirmDisabled={!canConfirmImport}
	cancelLabel={canConfirmImport ? "Cancel" : "Go Back"}
	onConfirm={confirmImportJson}
	onCancel={() => { showImportPreview = false; }}
>
	{#snippet children()}
		<div class="space-y-4">
			{#if importPreviewError}
				<div class="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{importPreviewError}</div>
				<p class="text-sm text-muted-foreground">Fix the JSON above, then click Import JSON again to preview it.</p>
			{:else}
				<p class="text-sm text-muted-foreground">
					No changes will be saved until you confirm. Template fields will be updated, and variants will be handled as shown below.
				</p>

				{#if importPreviewItems.length === 0}
					<div class="rounded-md border border-input bg-muted/30 p-3 text-sm text-muted-foreground">
						No variant changes detected. Template fields will still be updated.
					</div>
				{:else}
					<div class="max-h-72 overflow-auto rounded-md border border-input">
						<table class="w-full text-left text-sm">
							<thead class="sticky top-0 bg-muted text-xs uppercase tracking-wide text-muted-foreground">
								<tr>
									<th class="px-3 py-2 font-medium">Variant</th>
									<th class="px-3 py-2 font-medium">Slot values</th>
									<th class="px-3 py-2 font-medium">Change</th>
								</tr>
							</thead>
							<tbody class="divide-y divide-input">
								{#each importPreviewItems as item, index (`${item.status}-${item.id ?? 'new'}-${index}`)}
									<tr>
										<td class="whitespace-nowrap px-3 py-2 font-medium text-foreground">{item.id === null ? "New" : `#${item.id}`}</td>
										<td class="px-3 py-2 text-muted-foreground">{item.title}</td>
										<td class="px-3 py-2">
											<span class={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${statusClass(item.status)}`}>
												{item.status}
											</span>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			{/if}
		</div>
	{/snippet}
</BottomSheet>
