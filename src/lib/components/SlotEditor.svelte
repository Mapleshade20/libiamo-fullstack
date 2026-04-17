<script lang="ts">
import { Button } from "$lib/components/ui/button";
import { Input } from "$lib/components/ui/input";
import { Label } from "$lib/components/ui/label";

interface Props {
	/** Current slot values (bindable) */
	value: Record<string, string>;
	/** Slot names used in template fields */
	requiredSlots: Set<string>;
	/** Hidden input name for form serialisation */
	name?: string;
	/** Called when value changes */
	onchange?: (value: Record<string, string>) => void;
}

type Row = { key: string; val: string };

function rowsFromValue(value: Record<string, string>): Row[] {
	return Object.entries(value ?? {}).map(([key, val]) => ({ key, val }));
}

function valueFromRows(rows: Row[]): Record<string, string> {
	const newValue: Record<string, string> = {};
	for (const row of rows) {
		if (row.key.trim()) {
			newValue[row.key.trim()] = row.val;
		}
	}
	return newValue;
}

let { value = $bindable({}), requiredSlots, name, onchange }: Props = $props();

// Local rows state derived from value
let rows = $state<Row[]>(rowsFromValue(value));

// Track what we last pushed to parent so we can distinguish external value changes
let lastSyncedJson = JSON.stringify(value ?? {});

// Only sync external value changes → rows (not our own writes)
$effect(() => {
	const incoming = JSON.stringify(value ?? {});
	if (incoming !== lastSyncedJson) {
		lastSyncedJson = incoming;
		rows = rowsFromValue(value);
	}
});

function syncToParent() {
	const newValue = valueFromRows(rows);
	lastSyncedJson = JSON.stringify(newValue);
	value = newValue;
	onchange?.(newValue);
}

// Check if a slot name is unused (not in requiredSlots)
function isUnused(key: string): boolean {
	return key.trim() !== "" && !requiredSlots.has(key.trim());
}

// Check if a required slot is missing from rows
function getMissingRequired(): string[] {
	const present = new Set(rows.map((r) => r.key.trim()).filter(Boolean));
	return [...requiredSlots].filter((s) => !present.has(s)).sort();
}

function addRow() {
	rows = [...rows, { key: "", val: "" }];
}

function removeRow(index: number) {
	rows = rows.filter((_, i) => i !== index);
	syncToParent();
}

function updateKey(index: number, newKey: string) {
	rows = rows.map((r, i) => (i === index ? { ...r, key: newKey } : r));
	syncToParent();
}

function updateVal(index: number, newVal: string) {
	rows = rows.map((r, i) => (i === index ? { ...r, val: newVal } : r));
	syncToParent();
}

function addMissingSlots() {
	const missing = getMissingRequired();
	rows = [...rows, ...missing.map((key) => ({ key, val: "" }))];
	syncToParent();
}

const missingRequired = $derived(getMissingRequired());
const serialized = $derived(JSON.stringify(value));
</script>

<div class="space-y-3">
	{#if name}
		<input type="hidden" {name} value={serialized}>
	{/if}

	{#each rows as row, i (i)}
		<div class="flex items-start gap-2">
			<div class="flex-1 space-y-1">
				<Label class="text-xs text-muted-foreground">Slot name</Label>
				<Input
					value={row.key}
					oninput={(e) => updateKey(i, e.currentTarget.value)}
					placeholder="slotName"
					class={isUnused(row.key) ? "border-amber-400" : ""}
				/>
				{#if isUnused(row.key)}
					<p class="text-xs text-amber-600">Not used in template fields</p>
				{/if}
			</div>
			<div class="flex-[2] space-y-1">
				<Label class="text-xs text-muted-foreground">Value</Label>
				<Input value={row.val} oninput={(e) => updateVal(i, e.currentTarget.value)} placeholder="replacement value" />
			</div>
			<button type="button" onclick={() => removeRow(i)} class="mt-6 text-muted-foreground hover:text-destructive" aria-label="Remove slot">
				<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
					<title>Remove</title>
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
				</svg>
			</button>
		</div>
	{/each}

	<div class="flex gap-2">
		<Button type="button" variant="outline" size="sm" onclick={addRow}> + Add Slot </Button>
		{#if missingRequired.length > 0}
			<Button type="button" variant="secondary" size="sm" onclick={addMissingSlots}> Add Missing ({missingRequired.join(", ")}) </Button>
		{/if}
	</div>

	{#if missingRequired.length > 0}
		<p class="text-xs text-red-600">Missing required slots: {missingRequired.join(", ")}</p>
	{/if}
</div>
