<script lang="ts">
import CircleAlert from "@lucide/svelte/icons/circle-alert";
import CircleCheck from "@lucide/svelte/icons/circle-check";
import Info from "@lucide/svelte/icons/info";
import TriangleAlert from "@lucide/svelte/icons/triangle-alert";
import type { Snippet } from "svelte";
import { cn } from "$lib/utils";

/* A message that needs attention: a quiet tinted well with an icon. Text stays ink; the tone colours the icon and tint. */
let {
	tone = "info",
	title,
	role,
	class: className,
	children,
}: {
	tone?: "info" | "success" | "warning" | "danger";
	title?: string;
	role?: "status" | "alert";
	class?: string;
	children?: Snippet;
} = $props();

const Icon = $derived({ info: Info, success: CircleCheck, warning: TriangleAlert, danger: CircleAlert }[tone]);
</script>

<div
	{role}
	class={cn(
		"flex gap-2.5 rounded-lg px-3.5 py-3 text-sm leading-relaxed text-foreground",
		{
			info: "bg-foreground/[0.04]",
			success: "bg-success/[0.08]",
			warning: "bg-warning/[0.1]",
			danger: "bg-destructive/[0.07]",
		}[tone],
		className,
	)}
>
	<Icon
		class={cn("mt-0.5 size-4 shrink-0", { info: "text-muted-foreground", success: "text-success", warning: "text-warning", danger: "text-destructive" }[tone])}
		aria-hidden="true"
	/>
	<div class="min-w-0 flex-1 space-y-1">
		{#if title}
			<p class="font-medium">{title}</p>
		{/if}
		{@render children?.()}
	</div>
</div>
