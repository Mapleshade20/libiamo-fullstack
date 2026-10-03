<script lang="ts">
import Plus from "@lucide/svelte/icons/plus";
import X from "@lucide/svelte/icons/x";
import { tick, untrack } from "svelte";
import { prefersReducedMotion } from "svelte/motion";
import { slide } from "svelte/transition";
import RequiredMark from "$lib/components/admin/RequiredMark.svelte";

/**
 * Objectives as a numbered list, one line each. Enter starts the next objective, Backspace on an
 * empty one removes it, and pasting several lines splits them. Submits one objective per line.
 */
let {
	value = $bindable([]),
	name = "objectives",
	required = false,
	error,
}: { value?: string[]; name?: string; required?: boolean; error?: string } = $props();

let nextId = 0;
const row = (text: string) => ({ id: nextId++, text });
// The list always shows at least one line to write in. The parent remounts it to load other content.
let rows = $state<Array<{ id: number; text: string }>>(untrack(() => (value.length ? value.map(row) : [row("")])));
let inputs: HTMLInputElement[] = $state([]);

const submitted = $derived(rows.map((item) => item.text.trim()).filter(Boolean));
const empty = $derived(submitted.length === 0);
const motion = $derived({ duration: prefersReducedMotion.current ? 0 : 160 });

$effect(() => {
	value = submitted;
});

async function focusRow(index: number, caret: "start" | "end" = "end") {
	await tick();
	const input = inputs[index];
	if (!input) return;
	input.focus();
	const at = caret === "end" ? input.value.length : 0;
	input.setSelectionRange(at, at);
}

function insertAfter(index: number, texts: string[] = [""]) {
	rows.splice(index + 1, 0, ...texts.map(row));
	void focusRow(index + texts.length);
}

function remove(index: number) {
	rows.splice(index, 1);
	if (rows.length === 0) rows.push(row(""));
	void focusRow(Math.max(0, index - 1));
}

function onkeydown(event: KeyboardEvent, index: number) {
	if (event.key === "Enter" && !event.isComposing) {
		event.preventDefault();
		insertAfter(index);
	} else if (event.key === "Backspace" && rows[index].text === "" && rows.length > 1) {
		event.preventDefault();
		remove(index);
	}
}

function onpaste(event: ClipboardEvent, index: number) {
	const lines = (event.clipboardData?.getData("text") ?? "")
		.split(/\r?\n/)
		.map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").trim())
		.filter(Boolean);
	if (lines.length < 2) return;
	event.preventDefault();
	const [first, ...rest] = lines;
	rows[index].text = rows[index].text ? `${rows[index].text} ${first}` : first;
	insertAfter(index, rest);
}
</script>

<fieldset class="objectives" aria-describedby={error ? `${name}-error` : undefined}>
	<legend class="mb-2 flex text-sm font-medium leading-none">
		Objectives
		{#if required}
			<RequiredMark />
		{/if}
	</legend>
	<input type="hidden" {name} value={submitted.join("\n")}>
	<ol class="list">
		{#each rows as item, index (item.id)}
			<li class="item" transition:slide={motion}>
				<span class="numeral" aria-hidden="true">{index + 1}</span>
				<input
					bind:this={inputs[index]}
					bind:value={item.text}
					class="line"
					aria-label={`Objective ${index + 1}`}
					data-feedback-name={name}
					placeholder={index === 0 ? "Give a convincing reason" : "Another objective"}
					required={required && empty && index === 0}
					onkeydown={(event) => onkeydown(event, index)}
					onpaste={(event) => onpaste(event, index)}
				>
				<button type="button" class="remove" aria-label={`Remove objective ${index + 1}`} onclick={() => remove(index)}>
					<X size={15} aria-hidden="true" />
				</button>
			</li>
		{/each}
	</ol>
	<button type="button" class="add" onclick={() => insertAfter(rows.length - 1)}>
		<Plus size={15} aria-hidden="true" />
		Add objective
	</button>
	{#if error}
		<p id="{name}-error" data-field-error={name} class="mt-2 text-sm text-red-600">{error}</p>
	{/if}
</fieldset>

<style>
.objectives {
	min-width: 0;
}

.list {
	margin: 0;
	padding: 0;
	list-style: none;
	border-top: 1px solid var(--border);
}

.item {
	display: grid;
	grid-template-columns: 2rem minmax(0, 1fr) 44px;
	align-items: center;
	min-height: 44px;
	border-bottom: 1px solid var(--border);
}

.numeral {
	font-size: 0.8125rem;
	color: var(--muted-foreground);
	font-variant-numeric: tabular-nums;
	text-align: center;
}

.line {
	width: 100%;
	min-height: 44px;
	padding: 0 0.5rem;
	border: 0;
	background: transparent;
	font-size: 0.875rem;
	color: var(--foreground);
	outline: none;
}

.line::placeholder {
	color: color-mix(in oklab, var(--muted-foreground) 60%, transparent);
}

.item:focus-within {
	background: color-mix(in oklab, var(--foreground) 3%, transparent);
	box-shadow: inset 2px 0 0 var(--ring);
}

.item:focus-within .numeral {
	color: var(--foreground);
}

.remove,
.add {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	min-height: 44px;
	border-radius: var(--radius-md);
	color: var(--muted-foreground);
	transition:
		color 140ms ease,
		background-color 140ms ease,
		opacity 140ms ease;
}

.remove {
	width: 44px;
	opacity: 0.45;
}

.item:hover .remove,
.item:focus-within .remove,
.remove:focus-visible {
	opacity: 1;
}

.remove:hover,
.add:hover {
	color: var(--foreground);
	background: color-mix(in oklab, var(--foreground) 5%, transparent);
}

.add {
	gap: 0.35rem;
	margin-top: 0.25rem;
	padding: 0 0.75rem 0 0.5rem;
	font-size: 0.875rem;
}

.remove:focus-visible,
.add:focus-visible {
	outline: 2px solid var(--ring);
	outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
	.remove,
	.add {
		transition: none;
	}
}
</style>
