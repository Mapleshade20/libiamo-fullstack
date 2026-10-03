<script lang="ts" module>
export type ChoiceItem = { value: string; label: string; description?: string; disabled?: boolean };
</script>

<script lang="ts">
import { cn } from "$lib/utils";

/*
 * One of a few options that each need a line of explanation: white radio cards with a visible dot.
 * Native radios, so forms, arrow keys and `form-attention` work as with any input. Selected means
 * an ink border and an ink dot.
 */
let {
	items,
	name,
	value = $bindable(""),
	legend,
	description,
	columns = 2,
	required = false,
	onValueChange,
	class: className,
}: {
	items: readonly ChoiceItem[];
	name: string;
	value?: string;
	legend: string;
	description?: string;
	columns?: 1 | 2 | 3;
	required?: boolean;
	onValueChange?: (value: string) => void;
	class?: string;
} = $props();

const id = $props.id();
</script>

<fieldset class={cn("min-w-0 space-y-2", className)} aria-describedby={description ? `${id}-help` : undefined} data-field-container>
	<legend class="mb-2 text-sm font-medium text-foreground">{legend}</legend>
	<div class={cn("grid grid-cols-1 gap-2", columns === 2 && "sm:grid-cols-2", columns === 3 && "sm:grid-cols-3")}>
		{#each items as item (item.value)}
			<label
				class="group flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-input bg-white/80 px-3 py-2.5 transition-[border-color,background-color] duration-150 ease-panel hover:border-foreground/30 has-[:checked]:border-foreground/55 has-[:checked]:bg-white has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50 motion-reduce:transition-none"
			>
				<input
					class="sr-only"
					type="radio"
					{name}
					value={item.value}
					checked={item.value === value}
					disabled={item.disabled}
					{required}
					onchange={() => {
						value = item.value;
						onValueChange?.(item.value);
					}}
				>
				<span
					class="mt-0.5 size-4 shrink-0 rounded-full border-2 border-foreground/35 bg-white transition-[border-width,border-color] duration-150 ease-panel group-has-[:checked]:border-[5px] group-has-[:checked]:border-foreground motion-reduce:transition-none"
					aria-hidden="true"
				></span>
				<span class="flex min-w-0 flex-col">
					<span class="text-sm font-medium">{item.label}</span>
					{#if item.description}
						<span class="text-sm text-muted-foreground">{item.description}</span>
					{/if}
				</span>
			</label>
		{/each}
	</div>
	{#if description}
		<p id="{id}-help" class="text-xs leading-relaxed text-muted-foreground">{description}</p>
	{/if}
</fieldset>
