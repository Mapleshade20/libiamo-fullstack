<script lang="ts" module>
export type ChoiceItem = { value: string; label: string; description?: string; disabled?: boolean };
</script>

<script lang="ts">
import { cn } from "#lib/utils.ts";

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
	hideLegend = false,
	flat = false,
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
	/** The legend is named by a row label beside it: keep it for assistive technology only. */
	hideLegend?: boolean;
	/** Already on a sheet of paper (a settings row): the options are lines on it, not a card of their own. */
	flat?: boolean;
} = $props();

const id = $props.id();
</script>

<fieldset class={cn("min-w-0 space-y-2", className)} aria-describedby={description ? `${id}-help` : undefined} data-field-container>
	<legend class={cn("mb-2 text-sm font-medium text-foreground", hideLegend && "sr-only")}>{legend}</legend>
	<!-- One card of options, a line apiece, rather than a card per option. -->
	<div
		class={cn(
			"grid grid-cols-1 divide-y divide-border",
			!flat && "overflow-hidden rounded-lg border border-[var(--edge)] bg-[var(--raised)] shadow-[var(--paper-lift)]",
			columns === 2 && "sm:grid-cols-2 sm:divide-x sm:divide-y-0",
			columns === 3 && "sm:grid-cols-3 sm:divide-x sm:divide-y-0",
		)}
	>
		{#each items as item (item.value)}
			<label
				class="group flex min-h-11 cursor-pointer items-start gap-3 px-3.5 py-3 transition-[background-color] duration-150 ease-panel hover:bg-foreground/[0.04] has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50 has-[:focus-visible]:ring-inset motion-reduce:transition-none"
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
					class="mt-0.5 size-4 shrink-0 rounded-full border-2 border-foreground/35 bg-[var(--raised)] transition-[border-width,border-color] duration-150 ease-panel group-has-[:checked]:border-[5px] group-has-[:checked]:border-foreground motion-reduce:transition-none"
					aria-hidden="true"
				></span>
				<span class="flex min-w-0 flex-col">
					<span class="text-sm font-medium group-has-[:checked]:font-semibold">{item.label}</span>
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
