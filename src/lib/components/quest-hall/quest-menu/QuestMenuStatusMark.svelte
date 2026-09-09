<script lang="ts">
import Bookmark from "@lucide/svelte/icons/bookmark";
import Check from "@lucide/svelte/icons/check";
import Circle from "@lucide/svelte/icons/circle";
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
	color: var(--menu-ink-muted);
}

.status[data-state="finished"] {
	color: var(--menu-green);
}

.status[data-state="active"] {
	color: var(--menu-brass-dark);
}

.status[data-state="stopped"] {
	color: var(--menu-wine);
}

.is-stamp {
	min-height: 2rem;
	padding: 0.3rem 0.55rem;
	border: 1px solid currentColor;
	border-radius: 0.16rem;
	transform: rotate(-1.5deg);
}
</style>
