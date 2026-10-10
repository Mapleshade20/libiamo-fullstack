<script lang="ts" module>
/** `hint` explains a disabled item: pressing it shows the note beside it. */
export type SelectItem = { value: string; label: string; disabled?: boolean; hint?: string };
</script>

<script lang="ts">
import Check from "@lucide/svelte/icons/check";
import ChevronDown from "@lucide/svelte/icons/chevron-down";
import { Select } from "bits-ui";
import { tick } from "svelte";
import { cn } from "$lib/utils";
import SideTip from "./SideTip.svelte";

/*
 * The app's only select. The list is a floating panel (transitions.dev "Menu dropdown"); the value
 * is mirrored into a hidden native <select>, so forms submit it, `required` and server field errors
 * reach it by name, `change` clears field feedback, and the server render already holds the value.
 */
let {
	items,
	value = $bindable(""),
	name,
	id,
	placeholder = "",
	required = false,
	disabled = false,
	form,
	variant = "field",
	size = "default",
	submitOnChange = false,
	onValueChange,
	class: className,
	contentClass,
	"aria-label": ariaLabel,
	"aria-describedby": ariaDescribedby,
	"aria-invalid": ariaInvalid,
	"data-feedback-name": feedbackName,
}: {
	items: readonly SelectItem[];
	value?: string;
	name?: string;
	id?: string;
	placeholder?: string;
	required?: boolean;
	disabled?: boolean;
	form?: string;
	/** `field` sits in forms; `ghost` is a borderless picker for toolbars and settings rows. */
	variant?: "field" | "ghost";
	size?: "default" | "sm";
	/** Submit the owning form after a change (filters). */
	submitOnChange?: boolean;
	onValueChange?: (value: string) => void;
	class?: string;
	contentClass?: string;
	"aria-label"?: string;
	"aria-describedby"?: string;
	"aria-invalid"?: boolean | "true" | "false";
	"data-feedback-name"?: string;
} = $props();

let native: HTMLSelectElement | undefined = $state();
let trigger: HTMLButtonElement | null = $state(null);
let sideTip: SideTip | undefined = $state();

const selected = $derived(items.find((item) => item.value === value));

async function change(next: string) {
	value = next;
	onValueChange?.(next);
	await tick();
	native?.dispatchEvent(new Event("change", { bubbles: true }));
	if (submitOnChange) native?.form?.requestSubmit();
}
</script>

<div class={cn("relative min-w-0", variant === "field" && "w-full", className)} data-control-root>
	<Select.Root type="single" {value} onValueChange={change} {disabled} items={items.map((item) => ({ ...item }))}>
		<Select.Trigger
			bind:ref={trigger}
			{id}
			aria-label={ariaLabel}
			aria-describedby={ariaDescribedby}
			aria-invalid={ariaInvalid}
			data-control-visual
			data-variant={variant}
			class={cn(
				"group/select inline-flex w-full min-w-0 cursor-pointer items-center justify-between gap-2 rounded-lg text-left text-sm text-foreground outline-none transition-[background-color,border-color,box-shadow] duration-150 ease-panel focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive motion-reduce:transition-none",
				size === "sm" ? "h-8 px-2.5 pointer-coarse:h-10" : "h-10 px-3 pointer-coarse:h-11",
				variant === "field"
					? "border border-input bg-white/80 hover:border-foreground/25 focus-visible:border-ring data-[state=open]:border-ring dark:bg-input/30"
					: "w-auto font-medium hover:bg-foreground/[0.06] data-[state=open]:bg-foreground/[0.06]",
			)}
		>
			<span class={cn("min-w-0 truncate", !selected && "text-muted-foreground")}>{selected?.label ?? placeholder}</span>
			<ChevronDown
				class="size-4 shrink-0 text-muted-foreground transition-transform duration-250 ease-panel group-data-[state=open]/select:-scale-y-100 motion-reduce:transition-none"
				aria-hidden="true"
			/>
		</Select.Trigger>
		<Select.Portal>
			<Select.Content
				sideOffset={6}
				collisionPadding={12}
				class={cn(
					"floating-panel select-panel z-[70] max-h-[min(22rem,var(--bits-select-content-available-height))] min-w-[max(var(--bits-select-anchor-width),10rem)] max-w-[min(28rem,calc(100vw-1.5rem))] overflow-y-auto text-sm",
					contentClass,
				)}
			>
				{#each items as item (item.value)}
					<Select.Item
						value={item.value}
						label={item.label}
						disabled={item.disabled}
						class="select-item"
						onpointerup={(event) => {
							if (item.disabled && item.hint) sideTip?.show(event.currentTarget, item.hint);
						}}
					>
						{#snippet children({ selected: isSelected })}
							<span class="min-w-0 flex-1">{item.label}</span>
							<Check class={cn("size-4 shrink-0", !isSelected && "invisible")} aria-hidden="true" />
						{/snippet}
					</Select.Item>
				{/each}
			</Select.Content>
		</Select.Portal>
	</Select.Root>
	<select
		bind:this={native}
		{name}
		{form}
		{required}
		{disabled}
		{value}
		data-feedback-name={feedbackName}
		tabindex="-1"
		aria-hidden="true"
		class="pointer-events-none absolute inset-x-0 bottom-0 h-px w-full opacity-0"
		onfocus={() => trigger?.focus()}
		onchange={(event) => {
			// Browser autofill writes the native control directly.
			if (event.currentTarget.value !== value) {
				value = event.currentTarget.value;
				onValueChange?.(value);
			}
		}}
	>
		{#if !selected}
			<option value=""></option>
		{/if}
		{#each items as item (item.value)}
			<option value={item.value} disabled={item.disabled}>{item.label}</option>
		{/each}
	</select>
	{#if items.some((item) => item.disabled && item.hint)}
		<SideTip bind:this={sideTip} />
	{/if}
</div>
