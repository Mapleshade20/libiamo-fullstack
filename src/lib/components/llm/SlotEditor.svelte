<script lang="ts">
import type { RecipeDescriptor } from "$lib/llm/lab";
import { unknownTemplateVariables } from "$lib/llm/template";

/** Edits one slot template, showing its variables and whether it differs from the code default. */
let {
	definition: slot,
	value = $bindable(),
	name,
	feedbackName,
}: {
	definition: RecipeDescriptor["slots"][number];
	value: string;
	/** Form field name, when the textarea itself is submitted. */
	name?: string;
	/** Target for `client/form-attention.ts` validation issues. */
	feedbackName?: string;
} = $props();

const id = $props.id();
const unknown = $derived(unknownTemplateVariables(value, slot.variables));
const changed = $derived(value !== slot.template);
</script>

<div class="space-y-1.5">
	<div class="flex flex-wrap items-baseline justify-between gap-2">
		<label for={id} class="text-sm font-medium"
			>{slot.label}
			{#if changed}
				<span class="ml-1 text-xs font-normal text-[#8a5a1f]">edited</span>
			{/if}</label
		>
		{#if changed}
			<button
				type="button"
				class="min-h-8 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring"
				onclick={() => (value = slot.template)}
			>
				Reset to default
			</button>
		{/if}
	</div>
	<textarea
		{id}
		{name}
		data-feedback-name={feedbackName}
		bind:value
		rows={Math.min(18, Math.max(3, value.split("\n").length + 1))}
		spellcheck="false"
		aria-invalid={unknown.length > 0}
		aria-describedby={`${id}-variables`}
		class="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-invalid:border-destructive"
	></textarea>
	<p id={`${id}-variables`} class="text-xs text-muted-foreground">
		{#if slot.variables.length}
			Variables:
			{#each slot.variables as variable, index}
				<code class="rounded bg-secondary px-1">{`{{${variable}}}`}</code>{index < slot.variables.length - 1 ? " " : ""}
			{/each}
		{:else}
			No variables.
		{/if}
		{#if unknown.length}
			<span class="text-destructive" role="alert"> Unknown: {unknown.map((variable) => `{{${variable}}}`).join(", ")}</span>
		{/if}
	</p>
</div>
