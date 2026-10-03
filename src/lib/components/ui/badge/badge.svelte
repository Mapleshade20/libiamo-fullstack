<script lang="ts" module>
import { tv, type VariantProps } from "tailwind-variants";

/* Status labels, codes and counts: a small sentence-case pill. Tone comes from a tint, never from caps. */
export const badgeVariants = tv({
	base: "inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden whitespace-nowrap rounded-full border border-transparent px-2 text-xs font-medium leading-none transition-colors has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&>svg]:pointer-events-none [&>svg]:size-3! focus-visible:ring-3 focus-visible:ring-ring/50",
	variants: {
		variant: {
			default: "bg-primary text-primary-foreground [a]:hover:bg-primary/88",
			secondary: "bg-foreground/[0.06] text-foreground [a]:hover:bg-foreground/[0.1]",
			outline: "border-border text-muted-foreground [a]:hover:text-foreground",
			success: "bg-success/12 text-success",
			warning: "bg-warning/14 text-warning",
			destructive: "bg-destructive/10 text-destructive",
		},
	},
	defaultVariants: {
		variant: "secondary",
	},
});

export type BadgeVariant = VariantProps<typeof badgeVariants>["variant"];
</script>

<script lang="ts">
import type { HTMLAnchorAttributes } from "svelte/elements";
import { cn, type WithElementRef } from "$lib/utils.js";

let {
	ref = $bindable(null),
	href,
	class: className,
	variant = "secondary",
	children,
	...restProps
}: WithElementRef<HTMLAnchorAttributes> & {
	variant?: BadgeVariant;
} = $props();
</script>

<svelte:element this={href ? "a" : "span"} bind:this={ref} data-slot="badge" {href} class={cn(badgeVariants({ variant }), className)} {...restProps}>
	{@render children?.()}
</svelte:element>
