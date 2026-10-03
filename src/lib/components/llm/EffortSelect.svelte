<script lang="ts">
import Select from "$lib/components/common/Select.svelte";
import { REASONING_EFFORTS, type ReasoningEffort } from "$lib/constants";

/** Thinking effort for a Lab call; empty keeps the recipe's own effort. */
let {
	value = $bindable(""),
	recipeDefault,
	name,
	class: className = "",
}: { value: ReasoningEffort | ""; recipeDefault: ReasoningEffort; name?: string; class?: string } = $props();

const id = $props.id();
</script>

<div class={["flex min-w-0 flex-col gap-1.5", className]}>
	<label for={id} class="text-sm font-medium">Thinking effort</label>
	<Select
		{id}
		{name}
		{value}
		onValueChange={(next) => (value = next as ReasoningEffort | "")}
		items={[{ value: "", label: `Recipe default (${recipeDefault})` }, ...REASONING_EFFORTS.map((effort) => ({ value: effort, label: effort }))]}
	/>
</div>
