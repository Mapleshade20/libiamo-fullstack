<script lang="ts">
import type { HTMLInputAttributes, HTMLInputTypeAttribute } from "svelte/elements";
import { cn, type WithElementRef } from "$lib/utils.js";

type InputType = Exclude<HTMLInputTypeAttribute, "file">;

type Props = WithElementRef<Omit<HTMLInputAttributes, "type"> & ({ type: "file"; files?: FileList } | { type?: InputType; files?: undefined })>;

let {
	ref = $bindable(null),
	value = $bindable(),
	type,
	files = $bindable(),
	class: className,
	"data-slot": dataSlot = "input",
	...restProps
}: Props = $props();
</script>

{#if type === "file"}
	<input
		bind:this={ref}
		data-slot={dataSlot}
		class={cn(
			"border-input bg-white/80 hover:border-foreground/25 focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 aria-invalid:border-destructive dark:bg-input/30 rounded-lg border text-sm text-foreground transition-[border-color,box-shadow] duration-150 placeholder:text-muted-foreground focus-visible:ring-3 aria-invalid:ring-3 w-full min-w-0 outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 read-only:bg-transparent read-only:hover:border-input motion-reduce:transition-none h-10 px-3 pointer-coarse:h-11 file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
			className
		)}
		type="file"
		bind:files
		bind:value
		{...restProps}
	>
{:else}
	<input
		bind:this={ref}
		data-slot={dataSlot}
		class={cn(
			"border-input bg-white/80 hover:border-foreground/25 focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 aria-invalid:border-destructive dark:bg-input/30 rounded-lg border text-sm text-foreground transition-[border-color,box-shadow] duration-150 placeholder:text-muted-foreground focus-visible:ring-3 aria-invalid:ring-3 w-full min-w-0 outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 read-only:bg-transparent read-only:hover:border-input motion-reduce:transition-none h-10 px-3 pointer-coarse:h-11 file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
			className
		)}
		{type}
		bind:value
		{...restProps}
	>
{/if}
