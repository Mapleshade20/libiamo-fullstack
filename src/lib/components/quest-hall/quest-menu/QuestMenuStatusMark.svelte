<script lang="ts">
/**
 * The one status mark for quest progress. Recommendations, the catalog, and both details pages all
 * render it, so a state looks the same wherever a task appears.
 */
import Bookmark from "@lucide/svelte/icons/bookmark";
import Check from "@lucide/svelte/icons/check";
import Circle from "@lucide/svelte/icons/circle";
import ClipboardCheck from "@lucide/svelte/icons/clipboard-check";
import RotateCcw from "@lucide/svelte/icons/rotate-ccw";
import type { QuestMenuItemState } from "$lib/quest-hall/menu";

interface Props {
	state: QuestMenuItemState;
	label: string;
	variant?: "line" | "stamp";
}

let { state, label, variant = "line" }: Props = $props();
</script>

<span class="status" class:is-stamp={variant === "stamp"} data-state={state}>
	<span aria-hidden="true">
		{#if state === "finished"}
			<Check size={14} />
		{:else if state === "active"}
			<Bookmark size={14} />
		{:else if state === "reviewing"}
			<ClipboardCheck size={14} />
		{:else if state === "stopped"}
			<RotateCcw size={14} />
		{:else}
			<Circle size={11} />
		{/if}
	</span>
	{label}
</span>

<style>
.status {
	display: inline-flex;
	width: fit-content;
	align-items: center;
	gap: 0.32rem;
	font-family: var(--font-sans);
	font-size: 0.7rem;
	font-weight: 680;
	letter-spacing: 0.075em;
	line-height: 1;
	text-transform: uppercase;
	color: var(--menu-ink-muted, #6d665d);
}

.status[data-state="finished"] {
	color: var(--menu-green, #416c55);
}

.status[data-state="active"] {
	color: var(--menu-brass-dark, #765d28);
}

.status[data-state="reviewing"] {
	color: var(--menu-blue, #526878);
}

.status[data-state="stopped"] {
	color: var(--menu-wine, #803945);
}

.is-stamp {
	min-height: 2rem;
	padding: 0.3rem 0.55rem;
	border: 1px solid currentColor;
	border-radius: 0.16rem;
	transform: rotate(-1.5deg);
}
</style>
