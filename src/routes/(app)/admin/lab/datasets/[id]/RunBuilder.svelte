<script lang="ts">
import Plus from "@lucide/svelte/icons/plus";
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
import { Textarea } from "$lib/components/ui/textarea";
import type { ReasoningEffort } from "$lib/constants";
import { type LabProviderOption, type RecipeDescriptor, temperaturePlaceholder } from "$lib/llm/lab";
import { unknownTemplateVariables } from "$lib/llm/template";

/** Builds the variant columns of a run: labels, slot edits, provider and temperature, plus the judge. */
let {
	recipe,
	providers,
	defaultRubric,
	caseCount,
	error = null,
}: { recipe: RecipeDescriptor; providers: LabProviderOption[]; defaultRubric: string; caseCount: number; error?: string | null } = $props();

type DraftVariant = {
	key: string;
	label: string;
	slots: Record<string, string>;
	providerRef: string;
	temperature: string;
	reasoningEffort: ReasoningEffort | "";
};

function defaults(): Record<string, string> {
	return Object.fromEntries(recipe.slots.map((slot) => [slot.name, slot.template]));
}

let counter = 1;
function nextKey(): string {
	counter += 1;
	return `v${counter}`;
}

let label = $state("");
let repeats = $state(1);
let variants = $state<DraftVariant[]>(
	untrack(() => [
		{ key: "v1", label: "Baseline", slots: defaults(), providerRef: providers[0]?.ref ?? "default", temperature: "", reasoningEffort: "" },
	]),
);
let judgeEnabled = $state(untrack(() => Boolean(defaultRubric)));
let rubric = $state(untrack(() => defaultRubric));
let judgeProvider = $state(untrack(() => providers[0]?.ref ?? "default"));
let submitting = $state(false);

function addVariant() {
	const last = variants.at(-1);
	variants.push({
		key: nextKey(),
		label: `Variant ${variants.length + 1}`,
		slots: { ...(last?.slots ?? defaults()) },
		providerRef: last?.providerRef ?? "default",
		temperature: last?.temperature ?? "",
		reasoningEffort: last?.reasoningEffort ?? "",
	});
}

const calls = $derived(caseCount * variants.length * repeats);

const payload = $derived(
	JSON.stringify({
		label,
		repeats,
		variants: variants.map((variant) => ({
			key: variant.key,
			label: variant.label,
			slots: variant.slots,
			providerRef: variant.providerRef,
			temperature: variant.temperature.trim() === "" ? null : Number(variant.temperature),
			reasoningEffort: variant.reasoningEffort || null,
		})),
		judge: judgeEnabled ? { rubric, providerRef: judgeProvider } : null,
	}),
);

function validate(): ValidationIssue[] {
	const issues: ValidationIssue[] = [];
	variants.forEach((variant, index) => {
		if (!variant.label.trim()) issues.push({ path: [`variant.${index}.label`], message: "Name the variant." });
		const temperature = Number(variant.temperature);
		if (variant.temperature.trim() !== "" && (!Number.isFinite(temperature) || temperature < 0 || temperature > 2))
			issues.push({ path: [`variant.${index}.temperature`], message: "Use a temperature from 0 to 2." });
		for (const slot of recipe.slots) {
			if (unknownTemplateVariables(variant.slots[slot.name] ?? "", slot.variables).length)
				issues.push({ path: [`variant.${index}.slot.${slot.name}`], message: "Unknown variables in this slot." });
		}
	});
	if (judgeEnabled && !rubric.trim()) issues.push({ path: ["rubric"], message: "Write the judge rubric." });
	return issues;
}

const uid = $props.id();
</script>

<form
	method="POST"
	action="?/createRun"
	class="space-y-4"
	use:enhance={() => {
		submitting = true;
		return async ({ update }) => {
			try {
				await update({ reset: false });
			} finally {
				submitting = false;
			}
		};
	}}
>
	<input type="hidden" name="payload" value={payload}>
	<div class="space-y-5" use:validateBeforeSubmit={validate}>
		<div class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem]">
			<Field label="Run label" for="{uid}-label">
				<Input id="{uid}-label" bind:value={label} maxlength={120} placeholder="e.g. without task brief" />
			</Field>
			<Field label="Repeats" for="{uid}-repeats"> <Input id="{uid}-repeats" type="number" min="1" max="5" bind:value={repeats} /> </Field>
		</div>

		<div class="grid gap-4 lg:grid-cols-2">
			{#each variants as variant, index (variant.key)}
				<fieldset class="min-w-0 space-y-3 rounded-xl border border-border bg-card p-4">
					<legend class="px-1 text-sm font-medium">Column {index + 1}</legend>
					<Field label="Label" for="{uid}-variant-{index}-label">
						<Input id="{uid}-variant-{index}-label" data-feedback-name={`variant.${index}.label`} bind:value={variant.label} maxlength={80} />
					</Field>
					<Field label="Provider" for="{uid}-variant-{index}-provider">
						<Select
							id="{uid}-variant-{index}-provider"
							bind:value={variant.providerRef}
							items={providers.map((provider) => ({ value: provider.ref, label: `${provider.label} · ${provider.model}` }))}
						/>
					</Field>
					<div class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
						<EffortSelect bind:value={variant.reasoningEffort} recipeDefault={recipe.reasoningEffort} />
						<Field label="Temperature" for="{uid}-variant-{index}-temperature">
							<Input
								id="{uid}-variant-{index}-temperature"
								inputmode="decimal"
								placeholder={temperaturePlaceholder(recipe)}
								data-feedback-name={`variant.${index}.temperature`}
								bind:value={variant.temperature}
							/>
						</Field>
					</div>
					<div class="divide-y divide-border border-t border-border">
						{#each recipe.slots as slot (slot.name)}
							<Accordion title={`${slot.label}${variant.slots[slot.name] !== slot.template ? " · edited" : ""}`} variant="plain">
								<SlotEditor definition={slot} bind:value={variant.slots[slot.name]} feedbackName={`variant.${index}.slot.${slot.name}`} />
							</Accordion>
						{/each}
					</div>
					{#if variants.length > 1}
						<Button variant="destructive" size="sm" onclick={() => variants.splice(index, 1)}>Remove column</Button>
					{/if}
				</fieldset>
			{/each}
		</div>
		{#if variants.length < 6}
			<Button variant="secondary" onclick={addVariant}><Plus aria-hidden="true" />Add column</Button>
		{/if}

		<div class="space-y-3 border-t border-border pt-4">
			<label class="flex min-h-11 cursor-pointer items-center justify-between gap-4 text-sm">
				Score each output with an LLM judge
				<Switch bind:checked={judgeEnabled} />
			</label>
			{#if judgeEnabled}
				<Field label="Rubric" for="{uid}-rubric"> <Textarea id="{uid}-rubric" rows={4} data-feedback-name="rubric" bind:value={rubric} /> </Field>
				<Field label="Judge provider" for="{uid}-judge-provider">
					<Select
						id="{uid}-judge-provider"
						bind:value={judgeProvider}
						items={providers.map((provider) => ({ value: provider.ref, label: `${provider.label} · ${provider.model}` }))}
					/>
				</Field>
			{/if}
		</div>

		<div class="flex flex-wrap items-center gap-3">
			<Button type="submit" disabled={submitting || caseCount === 0}>Start run</Button>
			<span class="text-sm text-muted-foreground tabular-nums"
				>{calls}
				call{calls === 1 ? "" : "s"}{judgeEnabled ? ` + up to ${calls} judge calls` : ""}</span
			>
		</div>
		{#if error}
			<p class="field-error-message" role="alert">{error}</p>
		{/if}
	</div>
</form>
