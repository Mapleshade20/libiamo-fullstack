<script lang="ts">
import { page } from "$app/state";
import { parseTemplateJson } from "$lib/admin/template-actions";
import ActionNotification from "$lib/components/ActionNotification.svelte";
import TemplateForm from "$lib/components/TemplateForm.svelte";
import { Badge } from "$lib/components/ui/badge";
import { Button } from "$lib/components/ui/button";
import { Textarea } from "$lib/components/ui/textarea";

let { data, form } = $props();

type ImportedTemplateData = {
	language?: string;
	interactionType?: string;
	urgency?: string | null;
	ui?: string;
	cadence?: string;
	difficulty?: number;
	maxTurns?: number | null;
	estimatedWords?: number | null;
	pointReward?: number;
	gemReward?: number;
	isActive?: boolean;
	agentStartsFirst?: boolean;
	titleBase?: string;
	shortObjectiveBase?: string | null;
	descriptionBase?: string | null;
	agentPromptBase?: string | null;
	materialsMd?: string | null;
	objectivesBase?: string[] | null;
	translationReference?: string[] | null;
	tags?: string[] | null;
};

let success = $derived(page.url.searchParams.get("success") === "1");
let importJsonText = $state("");
let importError = $state<string | null>(null);
let importFeedback = $state<string | null>(null);
let importedTemplate = $state<ImportedTemplateData | undefined>(undefined);
let importedSlotValues = $state<Record<string, string> | undefined>(undefined);
let importedOpeningState = $state<Record<string, unknown> | undefined>(undefined);
let importResetKey = $state("empty");
const importPlaceholder = '{"version":1,"template":{...},"variants":[...]}';
const actionNotification = $derived(
	success
		? {
				variant: "success" as const,
				title: "Template submitted",
				message: "Your template has been submitted for review. Thanks for your contribution!",
			}
		: null,
);

function formatDate(d: Date | null): string {
	if (!d) return "";
	return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function fillFromJson() {
	const result = parseTemplateJson(importJsonText);
	if (!result.success) {
		importError = result.error;
		importFeedback = null;
		return;
	}

	const firstVariant = result.data.variants.find((variant) => variant.isActive) ?? result.data.variants[0];
	importedTemplate = result.data.template;
	importedSlotValues = firstVariant?.slotValues;
	importedOpeningState = firstVariant?.openingState;
	importResetKey = `import-${Date.now()}`;
	importError = null;
	importFeedback =
		result.data.template.interactionType === "translate"
			? "Editor filled from JSON. Review the fields, make any edits, then submit for review."
			: `Editor filled from JSON using ${firstVariant?.isActive ? "the first active" : "the first"} variant. Review the fields, make any edits, then submit for review.`;
}
</script>

<svelte:head>
	<title>Contribute · Libiamo</title>
	<meta name="description" content="Contribute new language-learning templates and scenario ideas to Libiamo.">
</svelte:head>

<div class="space-y-10">
	<h1 class="text-3xl text-gray-800 font-medium">Contribute a Template</h1>

	<ActionNotification notification={actionNotification} />

	{#if success}
		<div class="rounded-md border border-border bg-card p-4 space-y-2">
			<p class="text-sm text-muted-foreground">An admin will review your template soon.</p>
			<a href="/" class="inline-block text-sm font-medium text-foreground underline underline-offset-2 hover:text-muted-foreground">
				&larr; Back to Quests
			</a>
		</div>
	{:else}
		<p class="text-muted-foreground">Propose a new learning scenario. Your submission will be reviewed by an admin before it goes live.</p>

		<details class="rounded-md border border-input bg-background p-4">
			<summary class="cursor-pointer text-sm font-medium">Import JSON</summary>
			<div class="mt-4 space-y-3">
				<p class="text-sm text-muted-foreground">
					Paste exported template JSON to fill the editor. You can edit everything before submitting for review.
					{#if importedTemplate && importedTemplate.interactionType !== "translate"}
						Only the first active variant is loaded for user contributions.
					{/if}
				</p>
				<Textarea bind:value={importJsonText} rows={8} placeholder={importPlaceholder} />
				{#if importError}
					<p class="text-sm text-red-600 whitespace-pre-wrap">{importError}</p>
				{/if}
				{#if importFeedback}
					<p class="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{importFeedback}</p>
				{/if}
				<Button type="button" variant="secondary" onclick={fillFromJson}>Fill editor from JSON</Button>
			</div>
		</details>

		{#key importResetKey}
			<TemplateForm
				template={importedTemplate}
				{form}
				submitLabel="Submit for Review"
				cancelHref="/"
				hideAdminFields
				confirmBeforeSubmit
				initialSlotValues={importedSlotValues}
				initialOpeningState={importedOpeningState}
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
							<p class="text-sm truncate">{c.titleBase}</p>
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
