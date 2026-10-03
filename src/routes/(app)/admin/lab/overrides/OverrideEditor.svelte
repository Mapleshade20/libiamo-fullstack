<script lang="ts">
import { untrack } from "svelte";
import { enhance } from "$app/forms";
import { type ValidationIssue, validateBeforeSubmit } from "$lib/client/form-attention";
import Accordion from "$lib/components/common/Accordion.svelte";
import Field from "$lib/components/common/Field.svelte";
import Select from "$lib/components/common/Select.svelte";
import Switch from "$lib/components/common/Switch.svelte";
import EffortSelect from "$lib/components/llm/EffortSelect.svelte";
import SlotEditor from "$lib/components/llm/SlotEditor.svelte";
import { Button } from "$lib/components/ui/button";
import { Input } from "$lib/components/ui/input";
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

const uid = $props.id();
</script>

<form method="POST" action="?/save" use:enhance={() => async ({ update }) => update({ reset: false })} class="space-y-3">
	<input type="hidden" name="payload" value={payload}>
	<div class="space-y-3" use:validateBeforeSubmit={validate}>
		<label class="flex min-h-11 cursor-pointer items-center justify-between gap-4 text-sm">
			Use this override for my own calls
			<Switch bind:checked={enabled} />
		</label>
		<div class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_11rem_10rem]">
			<Field label="Provider" for="{uid}-provider">
				<Select
					id="{uid}-provider"
					bind:value={providerRef}
					items={[
						{ value: "", label: "Normal routing (my key or the shared provider)" },
						...providers.map((provider) => ({ value: provider.ref, label: `${provider.label} · ${provider.model}` })),
					]}
				/>
			</Field>
			<EffortSelect bind:value={reasoningEffort} recipeDefault={recipe.reasoningEffort} />
			<Field label="Temperature" for="{uid}-temperature">
				<Input
					id="{uid}-temperature"
					inputmode="decimal"
					placeholder={temperaturePlaceholder(recipe)}
					data-feedback-name={`${recipe.id}.temperature`}
					bind:value={temperature}
				/>
			</Field>
		</div>
		{#if recipe.slots.length}
			<div class="divide-y divide-border border-y border-border">
				{#each recipe.slots as slot (slot.name)}
					<Accordion title={`${slot.label}${slots[slot.name] !== slot.template ? " · edited" : ""}`} variant="plain">
						<SlotEditor definition={slot} bind:value={slots[slot.name]} feedbackName={`${recipe.id}.slot.${slot.name}`} />
					</Accordion>
				{/each}
			</div>
		{/if}
		<Field label="Note" for="{uid}-note"> <Input id="{uid}-note" maxlength={500} bind:value={note} placeholder="What this override tries" /> </Field>
		<div class="flex flex-wrap items-center gap-2">
			<Button type="submit" variant="secondary">Save</Button>
			{#if message?.saved}
				<span class="text-sm text-success" role="status">Saved.</span>
			{/if}
		</div>
		{#if message?.error}
			<p class="field-error-message" role="alert">{message.error}</p>
		{/if}
	</div>
</form>
