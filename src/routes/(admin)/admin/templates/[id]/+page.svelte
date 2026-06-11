<script lang="ts">
import { enhance } from "$app/forms";
import ActionNotification from "$lib/components/ActionNotification.svelte";
import TemplateForm from "$lib/components/TemplateForm.svelte";
import { Button } from "$lib/components/ui/button";
import { Textarea } from "$lib/components/ui/textarea";

let { form, data } = $props();

const actionNotification = $derived(
	form?.saved
		? { variant: "success" as const, title: "Template saved", message: "Your template changes have been saved." }
		: form?.imported
			? { variant: "success" as const, title: "Template imported", message: "Template fields and variants were replaced from JSON." }
			: null,
);

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
			variants: data.variants.map((variant) => ({
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
				use:enhance={() => async ({ update }) => update({ reset: false })}
				class="space-y-2"
				onsubmit={(event) => {
					if (!confirm("Importing JSON will replace this template's fields and variants. Continue?")) event.preventDefault();
				}}
			>
				<p class="text-sm text-muted-foreground">Paste exported JSON to replace this template in-place.</p>
				<Textarea name="templateJson" rows={8} placeholder={templateExportJson} required />
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
