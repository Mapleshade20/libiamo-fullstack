<script lang="ts" module>
import type { HTMLAnchorAttributes, HTMLButtonAttributes } from "svelte/elements";
import { tv, type VariantProps } from "tailwind-variants";
import { cn, type WithElementRef } from "$lib/utils.js";

/*
 * Libiamo's design language (docs/design/2026-10-02-design-language.md): ink for the primary action,
 * a white bordered field for secondary ones, red text for undoing. Hover changes colour only; press
 * scales to 0.97. md is 40px (44px on touch), sm 32px (40px on touch).
 */
export const buttonVariants = tv({
	base: "group/button inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-transparent bg-clip-padding text-sm font-medium outline-none transition-[background-color,border-color,color,box-shadow,scale] duration-150 ease-panel active:not-aria-disabled:scale-[0.97] focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 motion-reduce:transition-none motion-reduce:active:scale-100 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
	variants: {
		variant: {
			default: "bg-primary text-primary-foreground hover:bg-primary/88",
			secondary:
				"border-input bg-white/80 text-foreground hover:border-foreground/25 hover:bg-white aria-expanded:border-foreground/25 aria-expanded:bg-white dark:bg-input/30 dark:hover:bg-input/50",
			ghost: "text-foreground hover:bg-foreground/[0.06] aria-expanded:bg-foreground/[0.06]",
			destructive: "text-destructive hover:bg-destructive/10 focus-visible:ring-destructive/20",
			"destructive-solid": "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/30",
			link: "h-auto px-0 text-foreground underline decoration-foreground/30 underline-offset-4 hover:decoration-foreground active:scale-100",
		},
		size: {
			default: "h-10 px-4 pointer-coarse:h-11",
			sm: "h-8 gap-1 rounded-md px-3 pointer-coarse:h-10 [&_svg:not([class*='size-'])]:size-3.5",
			lg: "h-12 px-6 text-base",
			icon: "size-10 pointer-coarse:size-11",
			"icon-sm": "size-8 rounded-md pointer-coarse:size-10",
		},
	},
	compoundVariants: [{ variant: "link", class: "h-auto px-0" }],
	defaultVariants: {
		variant: "default",
		size: "default",
	},
});

export type ButtonVariant = VariantProps<typeof buttonVariants>["variant"];
export type ButtonSize = VariantProps<typeof buttonVariants>["size"];

export type ButtonProps = WithElementRef<HTMLButtonAttributes> &
	WithElementRef<HTMLAnchorAttributes> & {
		variant?: ButtonVariant;
		size?: ButtonSize;
	};
</script>

<script lang="ts">
let {
	class: className,
	variant = "default",
	size = "default",
	ref = $bindable(null),
	href = undefined,
	type = "button",
	disabled,
	children,
	...restProps
}: ButtonProps = $props();
</script>

{#if href}
	<a
		bind:this={ref}
		data-slot="button"
		class={cn(buttonVariants({ variant, size }), className)}
		href={disabled ? undefined : href}
		aria-disabled={disabled}
		tabindex={disabled ? -1 : undefined}
		{...restProps}
	>
		{@render children?.()}
	</a>
{:else}
	<button bind:this={ref} data-slot="button" class={cn(buttonVariants({ variant, size }), className)} {type} {disabled} {...restProps}>
		{@render children?.()}
	</button>
{/if}
