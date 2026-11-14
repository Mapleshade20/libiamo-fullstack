<script lang="ts">
import { Popover } from "bits-ui";
import type { Snippet } from "svelte";
import { cn } from "$lib/utils";

let {
	open = $bindable(false),
	label,
	trigger,
	children,
	triggerClass,
	class: className,
	onOpenChange,
	side = "bottom",
	align = "end",
	role = "dialog",
	plainTrigger = false,
}: {
	open?: boolean;
	label: string;
	trigger: Snippet;
	children: Snippet;
	triggerClass?: string;
	class?: string;
	onOpenChange?: (open: boolean) => void;
	side?: "top" | "bottom" | "left" | "right";
	align?: "start" | "center" | "end";
	role?: "dialog" | "menu";
	/** The trigger brings its own look (the sidebar's rows): no default target size or hover. */
	plainTrigger?: boolean;
} = $props();
</script>

<Popover.Root bind:open {onOpenChange}>
	<Popover.Trigger
		aria-label={label}
		class={cn(
			!plainTrigger &&
				"inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg outline-offset-4 hover:bg-secondary focus-visible:outline-2 focus-visible:outline-ring",
			triggerClass,
		)}
	>
		{@render trigger()}
	</Popover.Trigger>
	<Popover.Portal>
		<Popover.Content
			{side}
			{align}
			sideOffset={8}
			collisionPadding={12}
			trapFocus={false}
			{role}
			aria-label={label}
			class={cn(
				"floating-panel z-[60] w-52 max-w-[calc(100vw-1.5rem)] max-h-[var(--bits-popover-content-available-height)] overflow-y-auto text-sm",
				className,
			)}
		>
			{@render children()}
		</Popover.Content>
	</Popover.Portal>
</Popover.Root>
