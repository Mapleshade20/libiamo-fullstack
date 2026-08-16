<script lang="ts">
import { enhance } from "$app/forms";
import TemplateForm from "$lib/components/TemplateForm.svelte";
import { Button } from "$lib/components/ui/button";
import { Textarea } from "$lib/components/ui/textarea";

let { data, form } = $props();

const importPlaceholder = '{"version":1,"template":{...},"variants":[...]}';

// Pre-fill from contribution
let contributed = $derived(data?.contributionData);
let templateData = $derived(
	contributed
		? {
				language: contributed.language,
				interactionType: contributed.interactionType,
				ui: contributed.ui,
				titleBase: contributed.titleBase,
				shortObjectiveBase: contributed.shortObjectiveBase,
				descriptionBase: contributed.descriptionBase,
				agentPromptBase: contributed.agentPromptBase,
				materialsMd: contributed.materialsMd,
				objectivesBase: contributed.objectivesBase,
				translationReference: contributed.translationReference,
				tags: contributed.tags,
				cadence: contributed.cadence ?? undefined,
				difficulty: contributed.difficulty ?? undefined,
				agentStartsFirst: contributed.agentStartsFirst ?? undefined,
			}
		: undefined,
);
</script>

<svelte:head>
	<title>New Template · Admin · Libiamo</title>
	<meta name="description" content="Create a new Libiamo practice template.">
</svelte:head>

<div class="space-y-6">
	<h1 class="text-3xl">
		{#if contributed}
			Edit &amp; Approve Contribution
		{:else}
			New Template
		{/if}
	</h1>

	{#if contributed}
		<p class="text-muted-foreground">Reviewing contribution #{contributed.id}. Adjust fields below, then create to approve.</p>
	{/if}

	{#if !contributed}
		<details class="rounded-md border border-input bg-background p-4">
			<summary class="cursor-pointer text-sm font-medium">Import JSON</summary>
			<form method="POST" action="?/importJson" use:enhance={() => async ({ update }) => update({ reset: false })} class="mt-4 space-y-3">
				<p class="text-sm text-muted-foreground">Paste an exported template JSON file to create a new template with all variants.</p>
				<Textarea name="templateJson" rows={10} placeholder={importPlaceholder} required />
				<Button type="submit" variant="secondary">Import JSON</Button>
			</form>
		</details>
	{/if}

	<TemplateForm
		template={templateData}
		action="?/create"
		{form}
		submitLabel={contributed ? "Create & Approve" : "Create Template"}
		initialSlotValues={contributed?.slotValues as Record<string, string> | undefined}
		initialOpeningState={contributed?.openingState as Record<string, unknown> | undefined}
		extraHiddenFields={contributed ? { fromContributionId: String(contributed.id) } : undefined}
	/>

	{#if contributed}
		<!-- hidden field to track which contribution this is -->
		<p class="text-xs text-muted-foreground mt-4">After creation, contribution #{contributed.id} will be automatically marked as approved.</p>
	{/if}
</div>
