<script lang="ts">
import Bookmark from "@lucide/svelte/icons/bookmark";
import Check from "@lucide/svelte/icons/check";
import Circle from "@lucide/svelte/icons/circle";
import RotateCcw from "@lucide/svelte/icons/rotate-ccw";
import type { HallQuestSessionStatus } from "$lib/quest-hall";
import { getCarteTaskStatusLabel, getCarteTaskVisualState } from "./task-status";

interface Props {
	status: HallQuestSessionStatus;
	label?: string;
	variant?: "line" | "stamp";
	reduced?: boolean;
	class?: string;
}

let { status, label, variant = "line", reduced = false, class: className = "" }: Props = $props();
let state = $derived(getCarteTaskVisualState(status));
let visibleLabel = $derived(label ?? getCarteTaskStatusLabel(status));
</script>

<span class="task-status {className}" class:is-stamp={variant === "stamp"} class:is-reduced={reduced} data-state={state}>
	<span class="status-icon" aria-hidden="true">
		{#if state === "done"}
			<Check size={14} strokeWidth={2.2} />
		{:else if state === "active"}
			<Bookmark size={14} strokeWidth={2} fill="currentColor" />
		{:else if state === "resume"}
			<RotateCcw size={14} strokeWidth={2} />
		{:else}
			<Circle size={12} strokeWidth={1.8} />
		{/if}
	</span>
	<span>{visibleLabel}</span>
</span>

<style>
.task-status {
	display: inline-flex;
	align-items: center;
	gap: 0.38rem;
	width: fit-content;
	min-height: 1.75rem;
	font-family: var(--font-sans);
	font-size: 0.7rem;
	font-weight: 680;
	letter-spacing: 0.075em;
	line-height: 1;
	text-transform: uppercase;
	color: var(--carte-ink-muted, #6d665d);
}

.status-icon {
	display: grid;
	place-items: center;
	flex: 0 0 auto;
}

.task-status[data-state="active"] {
	color: var(--carte-wine, #803945);
}

.task-status[data-state="resume"] {
	color: var(--carte-brass-dark, #765d28);
}

.task-status[data-state="done"] {
	color: var(--carte-green, #416c55);
}

.is-stamp {
	min-height: 2rem;
	padding: 0.3rem 0.55rem;
	border: 1px solid currentColor;
	border-radius: 0.16rem;
	transform: rotate(-1.5deg);
}

@media (prefers-reduced-motion: no-preference) {
	.task-status[data-state="active"]:not(.is-reduced) .status-icon {
		animation: bookmark-breathe 2.8s ease-in-out infinite;
	}
}

@keyframes bookmark-breathe {
	0%,
	100% {
		transform: translateY(0);
	}
	50% {
		transform: translateY(-2px);
	}
}
</style>
