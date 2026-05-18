<script lang="ts">
import TemplateForm from "$lib/components/TemplateForm.svelte";

let { data, form } = $props();

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
				translationBase: contributed.translationBase,
				tags: contributed.tags,
				cadence: contributed.cadence ?? undefined,
				difficulty: contributed.difficulty ?? undefined,
				agentStartsFirst: contributed.agentStartsFirst ?? undefined,
			}
		: undefined,
);
</script>

<div class="space-y-6">
	<h1>
		{#if contributed}
			Edit &amp; Approve Contribution
		{:else}
			New Template
		{/if}
	</h1>

	{#if contributed}
		<p class="text-muted-foreground">Reviewing contribution #{contributed.id}. Adjust fields below, then create to approve.</p>
	{/if}

	<TemplateForm
		template={templateData}
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
