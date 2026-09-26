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

const fieldClass =
	"w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const buttonClass =
	"inline-flex min-h-11 items-center rounded-md border border-border px-4 text-sm hover:bg-secondary focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60";
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
	<div class="space-y-4" use:validateBeforeSubmit={validate}>
		<div class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem]">
			<label class="grid gap-1 text-sm">
				Run label
				<input class="{fieldClass} h-11" bind:value={label} maxlength="120" placeholder="e.g. without task brief">
			</label>
			<label class="grid gap-1 text-sm">
				Repeats
				<input class="{fieldClass} h-11" type="number" min="1" max="5" bind:value={repeats}>
			</label>
		</div>

		<div class="grid gap-4 lg:grid-cols-2">
			{#each variants as variant, index (variant.key)}
				<fieldset class="space-y-3 rounded-lg border border-border bg-card/40 p-3">
					<legend class="px-1 text-xs uppercase tracking-wider text-muted-foreground">Column {index + 1}</legend>
					<label class="grid gap-1 text-sm">
						Label
						<input class="{fieldClass} h-11" data-feedback-name={`variant.${index}.label`} bind:value={variant.label} maxlength="80">
					</label>
					<div class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
						<label class="grid gap-1 text-sm sm:col-span-2">
							Provider
							<select class="{fieldClass} h-11" bind:value={variant.providerRef}>
								{#each providers as provider}
									<option value={provider.ref}>{provider.label} · {provider.model}</option>
								{/each}
							</select>
						</label>
						<EffortSelect bind:value={variant.reasoningEffort} recipeDefault={recipe.reasoningEffort} class="{fieldClass} h-11" />
						<label class="grid gap-1 text-sm">
							Temperature
							<input
								class="{fieldClass} h-11"
								inputmode="decimal"
								placeholder={temperaturePlaceholder(recipe)}
								data-feedback-name={`variant.${index}.temperature`}
								bind:value={variant.temperature}
							>
						</label>
					</div>
					{#each recipe.slots as slot (slot.name)}
						<Accordion title={`${slot.label}${variant.slots[slot.name] !== slot.template ? " · edited" : ""}`} class="bg-background/60">
							<SlotEditor definition={slot} bind:value={variant.slots[slot.name]} feedbackName={`variant.${index}.slot.${slot.name}`} />
						</Accordion>
					{/each}
					{#if variants.length > 1}
						<button type="button" class={buttonClass} onclick={() => variants.splice(index, 1)}>Remove column</button>
					{/if}
				</fieldset>
			{/each}
		</div>
		{#if variants.length < 6}
			<button type="button" class={buttonClass} onclick={addVariant}>Add column</button>
		{/if}

		<div class="space-y-3 rounded-lg border border-border p-3">
			<label class="flex min-h-11 items-center gap-3 text-sm">
				<input type="checkbox" class="size-5 accent-foreground" bind:checked={judgeEnabled}>
				Score each output with an LLM judge
			</label>
			{#if judgeEnabled}
				<label class="grid gap-1 text-sm">
					Rubric
					<textarea class="{fieldClass} py-2" rows="4" data-feedback-name="rubric" bind:value={rubric}></textarea>
				</label>
				<label class="grid gap-1 text-sm">
					Judge provider
					<select class="{fieldClass} h-11" bind:value={judgeProvider}>
						{#each providers as provider}
							<option value={provider.ref}>{provider.label} · {provider.model}</option>
						{/each}
					</select>
				</label>
			{/if}
		</div>

		<div class="flex flex-wrap items-center gap-3">
			<button type="submit" class="{buttonClass} bg-[#38362f] text-[#faf8f4] hover:bg-[#4b483e]" disabled={submitting || caseCount === 0}>
				Start run
			</button>
			<span class="text-sm text-muted-foreground tabular-nums"
				>{calls}
				call{calls === 1 ? "" : "s"}{judgeEnabled ? ` + up to ${calls} judge calls` : ""}</span
			>
		</div>
		{#if error}
			<p class="text-sm text-destructive" role="alert">{error}</p>
		{/if}
	</div>
</form>
