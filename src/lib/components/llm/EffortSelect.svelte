<script lang="ts">
import { REASONING_EFFORTS, type ReasoningEffort } from "$lib/constants";

/** Thinking effort for a Lab call; empty keeps the recipe's own effort. */
let {
	value = $bindable(""),
	recipeDefault,
	class: className = "",
}: { value: ReasoningEffort | ""; recipeDefault: ReasoningEffort; class?: string } = $props();
</script>

<label class="grid gap-1 text-sm">
	Thinking effort
	<select class={className} bind:value>
		<option value="">Recipe default ({recipeDefault})</option>
		{#each REASONING_EFFORTS as effort}
			<option value={effort}>{effort}</option>
		{/each}
	</select>
</label>
