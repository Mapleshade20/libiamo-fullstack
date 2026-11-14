<script lang="ts">
let {
	remainingTurns = null as number | null,
	isCompleted = false,
	label = "Turns Left",
	class: className = "",
}: {
	remainingTurns?: number | null;
	isCompleted?: boolean;
	label?: string;
	class?: string;
} = $props();

let expanded = $state(false);
const expandedLabel = $derived(
	remainingTurns === null ? "" : label.includes("{count}") ? label.replace("{count}", String(remainingTurns)) : `${label}: ${remainingTurns}`,
);
</script>

{#if remainingTurns !== null && !isCompleted}
	<button
		type="button"
		class="md:hidden {className}"
		onclick={() => (expanded = !expanded)}
		aria-expanded={expanded}
		aria-label={expandedLabel}
		title={expandedLabel}
	>
		{expanded ? expandedLabel : remainingTurns}
	</button>
{/if}
