<script lang="ts">
import { untrack } from "svelte";
import { enhance } from "$app/forms";
import { type ValidationIssue, validateBeforeSubmit } from "$lib/client/form-attention";
import Accordion from "$lib/components/common/Accordion.svelte";
import EffortSelect from "$lib/components/llm/EffortSelect.svelte";
import SlotEditor from "$lib/components/llm/SlotEditor.svelte";
import type { ReasoningEffort } from "$lib/constants";
import { type LabProviderOption, type RecipeDescriptor, temperaturePlaceholder } from "$lib/llm/lab";
import { unknownTemplateVariables } from "$lib/llm/template";

type Saved = {
	enabled: boolean;
	slots: Record<string, string>;
	providerRef: string | null;
	temperature: number | null;
	reasoningEffort: ReasoningEffort | null;
	note: string;
};

/** One recipe's override for the viewer's own real-flow calls. */
let {
	recipe,
	providers,
	saved,
	message = null,
}: { recipe: RecipeDescriptor; providers: LabProviderOption[]; saved: Saved | null; message?: { error?: string; saved?: boolean } | null } = $props();

// Seeded once from the stored override.
let enabled = $state(untrack(() => saved?.enabled ?? true));
let slots = $state(untrack(() => Object.fromEntries(recipe.slots.map((slot) => [slot.name, saved?.slots[slot.name] ?? slot.template]))));
let providerRef = $state(untrack(() => saved?.providerRef ?? ""));
let temperature = $state(untrack(() => (saved?.temperature === null || saved?.temperature === undefined ? "" : String(saved.temperature))));
let reasoningEffort = $state<ReasoningEffort | "">(untrack(() => saved?.reasoningEffort ?? ""));
let note = $state(untrack(() => saved?.note ?? ""));

const payload = $derived(
	JSON.stringify({
		recipeId: recipe.id,
		enabled,
		slots,
		providerRef: providerRef || null,
		temperature: temperature.trim() === "" ? null : Number(temperature),
		reasoningEffort: reasoningEffort || null,
		note,
	}),
);

function validate(): ValidationIssue[] {
	const issues: ValidationIssue[] = [];
	for (const slot of recipe.slots) {
		if (unknownTemplateVariables(slots[slot.name] ?? "", slot.variables).length)
			issues.push({ path: [`${recipe.id}.slot.${slot.name}`], message: "Unknown variables in this slot." });
	}
	const value = Number(temperature);
	if (temperature.trim() !== "" && (!Number.isFinite(value) || value < 0 || value > 2))
		issues.push({ path: [`${recipe.id}.temperature`], message: "Use a temperature from 0 to 2." });
	return issues;
}

const fieldClass =
	"w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const buttonClass =
	"inline-flex min-h-11 items-center rounded-md border border-border px-4 text-sm hover:bg-secondary focus-visible:outline-2 focus-visible:outline-ring";
</script>

<form method="POST" action="?/save" use:enhance={() => async ({ update }) => update({ reset: false })} class="space-y-3">
	<input type="hidden" name="payload" value={payload}>
	<div class="space-y-3" use:validateBeforeSubmit={validate}>
		<label class="flex min-h-11 items-center gap-3 text-sm">
			<input type="checkbox" class="size-5 accent-foreground" bind:checked={enabled}>
			Use this override for my own calls
		</label>
		<div class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_11rem_10rem]">
			<label class="grid gap-1 text-sm">
				Provider
				<select class="{fieldClass} h-11" bind:value={providerRef}>
					<option value="">Normal routing (my key or the shared provider)</option>
					{#each providers as provider}
						<option value={provider.ref}>{provider.label} · {provider.model}</option>
					{/each}
				</select>
			</label>
			<EffortSelect bind:value={reasoningEffort} recipeDefault={recipe.reasoningEffort} class="{fieldClass} h-11" />
			<label class="grid gap-1 text-sm">
				Temperature
				<input
					class="{fieldClass} h-11"
					inputmode="decimal"
					placeholder={temperaturePlaceholder(recipe)}
					data-feedback-name={`${recipe.id}.temperature`}
					bind:value={temperature}
				>
			</label>
		</div>
		{#each recipe.slots as slot (slot.name)}
			<Accordion title={`${slot.label}${slots[slot.name] !== slot.template ? " · edited" : ""}`} class="bg-background/60">
				<SlotEditor definition={slot} bind:value={slots[slot.name]} feedbackName={`${recipe.id}.slot.${slot.name}`} />
			</Accordion>
		{/each}
		<label class="grid gap-1 text-sm">
			Note
			<input class="{fieldClass} h-11" maxlength="500" bind:value={note} placeholder="What this override tries">
		</label>
		<div class="flex flex-wrap items-center gap-2">
			<button type="submit" class={buttonClass}>Save</button>
			{#if message?.saved}
				<span class="text-sm text-muted-foreground" role="status">Saved.</span>
			{/if}
		</div>
		{#if message?.error}
			<p class="text-sm text-destructive" role="alert">{message.error}</p>
		{/if}
	</div>
</form>
