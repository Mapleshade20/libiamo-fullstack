<script lang="ts">
import Check from "@lucide/svelte/icons/check";
import { prefersReducedMotion } from "./motion";
import type { PracticeGenStatus } from "./types";

interface Props {
	status: PracticeGenStatus;
	generatingLabel: string;
	failedLabel: string;
	readyLabel: string;
	retryLabel: string;
	onretry?: () => void;
}

let { status, generatingLabel, failedLabel, readyLabel, retryLabel, onretry }: Props = $props();

const reduced = $derived(typeof window !== "undefined" ? prefersReducedMotion() : false);
const label = $derived(status === "generating" ? generatingLabel : status === "failed" ? failedLabel : status === "ready" ? readyLabel : "");
</script>

{#if status !== "idle"}
	<div
		class="pointer-events-auto fixed z-40 flex items-center gap-2.5 rounded-full border border-border bg-card/95 px-3.5 py-2 text-xs font-medium shadow-md backdrop-blur-sm
			top-[max(4.75rem,env(safe-area-inset-top)+3.5rem)] right-4 sm:top-20 sm:right-6"
		aria-live={status === "failed" ? "assertive" : "polite"}
	>
		{#if status === "generating"}
			<!-- Decorative spinner; status text carries the accessible name. -->
			<span class="relative inline-flex size-4 shrink-0" aria-hidden="true">
				<!-- biome-ignore lint/a11y/noSvgWithoutTitle: decorative, parent is aria-hidden -->
				<svg viewBox="0 0 20 20" class="size-4 {reduced ? '' : 'animate-spin'}" style={reduced ? "" : "animation-duration: 1.1s"} focusable="false">
					<circle cx="10" cy="10" r="7.5" fill="none" stroke="currentColor" stroke-width="1.5" class="text-muted-foreground/30" />
					<path
						d="M 10 2.5 A 7.5 7.5 0 0 1 17.5 10"
						fill="none"
						stroke="currentColor"
						stroke-width="1.75"
						stroke-linecap="round"
						class={reduced ? "text-foreground/70" : "text-foreground/80"}
					/>
				</svg>
			</span>
			<span class="text-foreground/85">{label}</span>
		{:else if status === "failed"}
			<button
				type="button"
				class="inline-flex items-center gap-2 text-destructive transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 rounded-full"
				onclick={() => onretry?.()}
			>
				<span class="inline-block size-2 rounded-full bg-destructive" aria-hidden="true"></span>
				<span>{label}</span>
				<span class="underline underline-offset-2">{retryLabel}</span>
			</button>
		{:else if status === "ready"}
			<span class="inline-flex size-4 items-center justify-center rounded-full bg-emerald-600/15 text-emerald-800" aria-hidden="true">
				<Check size={11} strokeWidth={2.5} />
			</span>
			<span class="text-foreground/85">{label}</span>
		{/if}
	</div>
{/if}
