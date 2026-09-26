<script lang="ts">
import Info from "@lucide/svelte/icons/info";
import { onDestroy } from "svelte";
import { fade } from "svelte/transition";
import type { LanguageCode } from "$lib/constants";
import { t } from "$lib/i18n";
import { cn } from "$lib/utils";

/** Tells the learner that a mock platform control is not part of the simulation. */
let { language, class: className = "" }: { language: LanguageCode; class?: string } = $props();

let visible = $state(false);
let timer: ReturnType<typeof setTimeout> | undefined;

export function show() {
	visible = true;
	clearTimeout(timer);
	timer = setTimeout(() => {
		visible = false;
	}, 2500);
}

onDestroy(() => clearTimeout(timer));
</script>

<div aria-live="polite" class="contents">
	{#if visible}
		<div
			transition:fade={{ duration: 150 }}
			class={cn(
				"fixed top-16 left-1/2 z-[2000] flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-2 rounded-md px-4 py-3 text-sm font-medium shadow-xl",
				className,
			)}
		>
			<Info size={16} class="shrink-0" aria-hidden="true" />
			{t(language, "practice.unavailable")}
		</div>
	{/if}
</div>
