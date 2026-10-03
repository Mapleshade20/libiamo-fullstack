<script lang="ts">
import type { Snippet } from "svelte";
import { cn } from "$lib/utils";

/*
 * Label above, control, help below, then the server error for `name`. The label is ordinary
 * selectable text in sentence case; required fields get a faint red asterisk (as `admin/RequiredMark`).
 */
let {
	label,
	for: forId,
	name,
	description,
	error,
	required = false,
	class: className,
	labelClass,
	children,
	actions,
}: {
	label: string;
	/** The control's id. */
	for?: string;
	/** Field name the error belongs to (defaults to `for`). */
	name?: string;
	description?: string;
	error?: string | null;
	required?: boolean;
	class?: string;
	labelClass?: string;
	children: Snippet;
	/** Small controls beside the label (for example a preview toggle). */
	actions?: Snippet;
} = $props();

const errorName = $derived(name ?? forId);
</script>

<div class={cn("flex min-w-0 flex-col gap-1.5", className)} data-field-container>
	<div class="flex min-h-5 items-end justify-between gap-3">
		<label for={forId} class={cn("text-sm font-medium leading-snug text-foreground", labelClass)}>
			{label}
			{#if required}
				<span class="ml-0.5 font-normal text-destructive/55" aria-hidden="true">*</span>
			{/if}
		</label>
		{@render actions?.()}
	</div>
	{#if description}
		<p id={forId ? `${forId}-help` : undefined} class="-mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>
	{/if}
	{@render children()}
	{#if error}
		<p data-field-error={errorName} class="field-error-message" role="alert">{error}</p>
	{/if}
</div>
