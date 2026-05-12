<script lang="ts">
import { untrack } from "svelte";
import { enhance } from "$app/forms";
import { extractSlotNames, getDefaultOpeningState, type UiVariant } from "$lib/admin/variant-helpers";
import OpeningStateEditor from "$lib/components/OpeningStateEditor.svelte";
import SlotEditor from "$lib/components/SlotEditor.svelte";
import { Button } from "$lib/components/ui/button";
import { Input } from "$lib/components/ui/input";
import { Label } from "$lib/components/ui/label";
import { Textarea } from "$lib/components/ui/textarea";
import {
	CADENCES,
	INTERACTION_TYPE_LABELS,
	INTERACTION_TYPES,
	LANGUAGE_CODES,
	LANGUAGE_LABELS,
	UI_VARIANT_LABELS,
	UI_VARIANTS,
} from "$lib/constants";
import { renderMarkdown } from "$lib/markdown";

type VariantData = {
	id: number;
	isActive: boolean;
	slotValues: unknown;
	openingState: unknown;
};

type TemplateData = {
	language?: string;
	interactionType?: string;
	ui?: string;
	cadence?: string;
	difficulty?: number;
	maxTurns?: number | null;
	estimatedWords?: number | null;
	pointReward?: number;
	gemReward?: number;
	isActive?: boolean;
	agentStartsFirst?: boolean;
	titleBase?: string;
	shortObjectiveBase?: string | null;
	descriptionBase?: string | null;
	agentPromptBase?: string | null;
	materialsMd?: string | null;
	objectivesBase?: string[] | null;
	translationBase?: string[][] | null;
	tags?: string[] | null;
};

interface Props {
	template?: TemplateData;
	variants?: VariantData[];
	form?: {
		message?: string;
		errors?: Record<string, string[]>;
	} | null;
	action?: string;
	submitLabel?: string;
}

let { template = {} as TemplateData, variants = [], form = null, action = "", submitLabel = "Save" }: Props = $props();
let mainFormEl: HTMLFormElement | null = null;

function getScrollableParent(element: HTMLElement): HTMLElement | null {
	let current = element.parentElement;
	while (current) {
		const style = window.getComputedStyle(current);
		const overflowY = style.overflowY;
		const canScroll = (overflowY === "auto" || overflowY === "scroll") && current.scrollHeight > current.clientHeight;
		if (canScroll) return current;
		current = current.parentElement;
	}
	return null;
}

function centerField(element: HTMLElement) {
	const scrollParent = getScrollableParent(element);
	const elementRect = element.getBoundingClientRect();

	if (!scrollParent) {
		const targetTop = window.scrollY + elementRect.top - window.innerHeight / 2 + elementRect.height / 2;
		window.scrollTo({
			top: Math.max(0, targetTop),
			behavior: "smooth",
		});
	} else {
		const parentRect = scrollParent.getBoundingClientRect();
		const offsetTop = elementRect.top - parentRect.top;
		const targetTop = scrollParent.scrollTop + offsetTop - scrollParent.clientHeight / 2 + elementRect.height / 2;
		scrollParent.scrollTo({
			top: Math.max(0, targetTop),
			behavior: "smooth",
		});
	}
}

function handleInvalidCapture(event: Event) {
	const field = event.target as HTMLElement | null;
	if (!field) return;

	requestAnimationFrame(() => {
		centerField(field);
		// One more pass to beat late browser scrolling.
		requestAnimationFrame(() => centerField(field));
	});
}

const isEditMode = $derived("id" in template);

// ── Tracked form field values for slot extraction ────────────────
let titleBase = $state(untrack(() => template.titleBase ?? ""));
let shortObjectiveBase = $state(untrack(() => template.shortObjectiveBase ?? ""));
let descriptionBase = $state(untrack(() => template.descriptionBase ?? ""));
let agentPromptBase = $state(untrack(() => template.agentPromptBase ?? ""));
let objectivesText = $state(untrack(() => (template.objectivesBase ?? []).join("\n")));

$effect(() => {
	titleBase = template.titleBase ?? "";
	shortObjectiveBase = template.shortObjectiveBase ?? "";
	descriptionBase = template.descriptionBase ?? "";
	agentPromptBase = template.agentPromptBase ?? "";
	objectivesText = (template.objectivesBase ?? []).join("\n");
});

// Parse objectives text to array for slot extraction
const objectivesArray = $derived(
	objectivesText
		.split("\n")
		.map((s) => s.trim())
		.filter(Boolean),
);

// Live-extract required slots from all slot-supporting fields
const requiredSlots = $derived(
	extractSlotNames({
		titleBase,
		shortObjectiveBase,
		descriptionBase,
		agentPromptBase,
		objectivesBase: objectivesArray,
	}),
);

// ── Interaction type tracking ────────────────────────────────────
let selectedInteractionType = $state<string>(untrack(() => template.interactionType ?? "chat"));
$effect(() => {
	selectedInteractionType = template.interactionType ?? "chat";
});

let isTranslate = $derived(selectedInteractionType === "translate");

// ── UI variant tracking ──────────────────────────────────────────
let selectedUi = $state<UiVariant>(untrack(() => (template.ui as UiVariant) ?? "reddit"));
$effect(() => {
	selectedUi = (template.ui as UiVariant) ?? "reddit";
});

// Auto-set UI variant and lock when interactionType is translate.
// When switching away, reset to a valid non-translator default so the
// <select> never holds a value excluded from its options.
$effect(() => {
	if (isTranslate) {
		selectedUi = "translator";
	} else if (selectedUi === "translator") {
		selectedUi = "reddit";
	}
});

// Filter out translator from UI options when not translate
const uiOptions = $derived(isTranslate ? UI_VARIANTS : UI_VARIANTS.filter((v) => v !== "translator"));

// Markdown preview
let showMdPreview = $state(false);
let mdSource = $state(untrack(() => template.materialsMd ?? ""));
$effect(() => {
	mdSource = template.materialsMd ?? "";
});
let mdHtml = $derived(showMdPreview ? renderMarkdown(mdSource) : "");

// Tags: comma-separated
let tagsValue = $derived((template.tags ?? []).join(", "));

// ── Variant editing state (edit mode) ────────────────────────────
let editingVariantId = $state<number | null>(null);
let showAddVariant = $state(false);

// Track draft state per variant for dirty detection
type VariantDraft = {
	slotValues: Record<string, string>;
	openingState: Record<string, unknown>;
	originalJson: string;
};
let variantDrafts = $state<Map<number, VariantDraft>>(new Map());

// Initialize drafts from variants prop
$effect(() => {
	const newDrafts = new Map<number, VariantDraft>();
	for (const v of variants) {
		const sv = (v.slotValues ?? {}) as Record<string, string>;
		const os = (v.openingState ?? {}) as Record<string, unknown>;
		newDrafts.set(v.id, {
			slotValues: { ...sv },
			openingState: { ...os },
			originalJson: JSON.stringify({ sv, os }),
		});
	}
	variantDrafts = newDrafts;
});

function getVariantDraft(id: number): VariantDraft {
	return (
		variantDrafts.get(id) ?? {
			slotValues: {},
			openingState: {},
			originalJson: "{}",
		}
	);
}

function isVariantDirty(id: number): boolean {
	const draft = variantDrafts.get(id);
	if (!draft) return false;
	const currentJson = JSON.stringify({
		sv: draft.slotValues,
		os: draft.openingState,
	});
	return currentJson !== draft.originalJson;
}

const dirtyVariantIds = $derived([...variantDrafts.keys()].filter((id) => isVariantDirty(id)));
const hasDirtyVariants = $derived(dirtyVariantIds.length > 0);

// Update draft slot values
function updateDraftSlots(id: number, slots: Record<string, string>) {
	const draft = getVariantDraft(id);
	variantDrafts.set(id, { ...draft, slotValues: slots });
	variantDrafts = new Map(variantDrafts);
}

// Update draft opening state
function updateDraftOpeningState(id: number, state: Record<string, unknown>) {
	const draft = getVariantDraft(id);
	variantDrafts.set(id, { ...draft, openingState: state });
	variantDrafts = new Map(variantDrafts);
}

// ── Create mode: first variant state ─────────────────────────────
let firstVariantSlots = $state<Record<string, string>>({});
let firstVariantOpeningState = $state<Record<string, unknown>>({});

// Reset opening state when UI changes in create mode
$effect(() => {
	if (!isEditMode) {
		firstVariantOpeningState = getDefaultOpeningState(selectedUi) as Record<string, unknown>;
	}
});

// ── Add variant state ────────────────────────────────────────────
let newVariantSlots = $state<Record<string, string>>({});
let newVariantOpeningState = $state<Record<string, unknown>>({});

// Reset when toggling add variant panel or UI changes
$effect(() => {
	if (showAddVariant) {
		newVariantOpeningState = getDefaultOpeningState(selectedUi) as Record<string, unknown>;
	}
});

function jsonStr(val: unknown): string {
	if (!val || (typeof val === "object" && Object.keys(val as object).length === 0)) return "{}";
	try {
		return JSON.stringify(val, null, 2);
	} catch {
		return "{}";
	}
}
</script>

<form method="POST" {action} use:enhance class="space-y-8" bind:this={mainFormEl} oninvalidcapture={handleInvalidCapture}>
	{#if form?.message}
		<p class="rounded-md bg-red-50 p-3 text-sm text-red-700">{form.message}</p>
	{/if}

	<!-- Section A: Metadata -->
	<fieldset class="space-y-4">
		<h2 class="uppercase tracking-widest text-muted-foreground">Metadata</h2>
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
			<div class="space-y-2">
				<Label for="language">Language</Label>
				<select id="language" name="language" class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" required>
					{#each LANGUAGE_CODES as code}
						<option value={code} selected={template.language === code}>{LANGUAGE_LABELS[code]}</option>
					{/each}
				</select>
				{#if form?.errors?.language}
					<p class="text-sm text-red-600">{form.errors.language[0]}</p>
				{/if}
			</div>

			<div class="space-y-2">
				<Label for="interactionType">Interaction Type</Label>
				<select
					id="interactionType"
					name="interactionType"
					class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
					required
					bind:value={selectedInteractionType}
				>
					{#each INTERACTION_TYPES as type}
						<option value={type}>{INTERACTION_TYPE_LABELS[type]}</option>
					{/each}
				</select>
				{#if form?.errors?.interactionType}
					<p class="text-sm text-red-600">{form.errors.interactionType[0]}</p>
				{/if}
			</div>

			<div class="space-y-2">
				<Label for="ui">UI Variant {isTranslate ? "(auto: Translator)" : ""}</Label>
				<select
					id="ui"
					name="ui"
					class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
					required
					bind:value={selectedUi}
					disabled={isTranslate}
				>
					{#each uiOptions as variant}
						<option value={variant}>{UI_VARIANT_LABELS[variant]}</option>
					{/each}
				</select>
				{#if isTranslate}
					<input type="hidden" name="ui" value="translator">
				{/if}
				{#if form?.errors?.ui}
					<p class="text-sm text-red-600">{form.errors.ui[0]}</p>
				{/if}
			</div>

			{#if !isTranslate}
				<div class="space-y-2">
					<Label for="cadence">Cadence</Label>
					<select id="cadence" name="cadence" class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" required>
						{#each CADENCES as cadence}
							<option value={cadence} selected={template.cadence === cadence}>
								{cadence === "none" ? "None" : cadence.charAt(0).toUpperCase() + cadence.slice(1)}
							</option>
						{/each}
					</select>
					{#if form?.errors?.cadence}
						<p class="text-sm text-red-600">{form.errors.cadence[0]}</p>
					{/if}
				</div>
			{:else}
				<input type="hidden" name="cadence" value="none">
			{/if}

			<div class="space-y-2">
				<Label for="difficulty">Difficulty (1–3)</Label>
				<Input id="difficulty" name="difficulty" type="number" min="1" max="3" value={template.difficulty ?? 1} required />
				{#if form?.errors?.difficulty}
					<p class="text-sm text-red-600">{form.errors.difficulty[0]}</p>
				{/if}
			</div>

			{#if !isTranslate}
				<div class="space-y-2">
					<Label for="maxTurns">Max Turns</Label>
					<Input id="maxTurns" name="maxTurns" type="number" min="0" value={template.maxTurns ?? ""} />
				</div>
			{/if}

			<div class="space-y-2">
				<Label for="estimatedWords">Estimated Words</Label>
				<Input id="estimatedWords" name="estimatedWords" type="number" min="0" value={template.estimatedWords ?? ""} />
			</div>

			<div class="space-y-2">
				<Label for="pointReward">Point Reward</Label>
				<Input id="pointReward" name="pointReward" type="number" min="0" value={template.pointReward ?? 3} required />
				{#if form?.errors?.pointReward}
					<p class="text-sm text-red-600">{form.errors.pointReward[0]}</p>
				{/if}
			</div>

			<div class="space-y-2">
				<Label for="gemReward">Gem Reward</Label>
				<Input id="gemReward" name="gemReward" type="number" min="0" value={template.gemReward ?? 30} required />
				{#if form?.errors?.gemReward}
					<p class="text-sm text-red-600">{form.errors.gemReward[0]}</p>
				{/if}
			</div>

			<div class="flex items-center gap-2 pt-6">
				<input id="isActive" name="isActive" type="checkbox" checked={template.isActive ?? true} class="rounded border-input">
				<Label for="isActive">Active</Label>
			</div>
			<div class="flex items-center gap-2 pt-6">
				<input id="agentStartsFirst" name="agentStartsFirst" type="checkbox" checked={template.agentStartsFirst ?? true} class="rounded border-input">
				<Label for="agentStartsFirst" class="cursor-pointer">Agent Starts First (Auto-Greeting)</Label>
			</div>
		</div>
	</fieldset>

	<!-- Section B: Content -->
	<fieldset class="space-y-4">
		<h2 class="uppercase tracking-widest text-muted-foreground">Content</h2>

		<div class="space-y-2">
			<Label for="titleBase">Title (supports &#123;&#123;slot&#125;&#125; placeholders)</Label>
			<Input id="titleBase" name="titleBase" bind:value={titleBase} required />
			{#if form?.errors?.titleBase}
				<p class="text-sm text-red-600">{form.errors.titleBase[0]}</p>
			{/if}
		</div>

		<div class="space-y-2">
			<Label for="shortObjectiveBase">Short Objective (1–2 sentences, shown on card)</Label>
			<Textarea id="shortObjectiveBase" name="shortObjectiveBase" rows={2} bind:value={shortObjectiveBase} />
		</div>

		<div class="space-y-2">
			<Label for="descriptionBase">Description</Label>
			<Textarea id="descriptionBase" name="descriptionBase" rows={3} bind:value={descriptionBase} />
		</div>

		{#if !isTranslate}
			<div class="space-y-2">
				<Label for="agentPromptBase"> Agent Prompt (MBTI persona prefix injected automatically at schedule time) </Label>
				<Textarea id="agentPromptBase" name="agentPromptBase" rows={4} bind:value={agentPromptBase} />
			</div>
		{/if}

		{#if !isTranslate}
			<div class="space-y-2">
				<Label for="objectivesBase">Objectives (one per line)</Label>
				<Textarea
					id="objectivesBase"
					name="objectivesBase"
					rows={4}
					bind:value={objectivesText}
					placeholder="Give a convincing reason&#10;Do not over-explain&#10;Show you still value the friendship"
				/>
				{#if form?.errors?.objectivesBase}
					<p class="text-sm text-red-600">{form.errors.objectivesBase[0]}</p>
				{/if}
			</div>
		{/if}

		<div class="space-y-2">
			<Label for="tags">Tags (comma-separated)</Label>
			<Input id="tags" name="tags" value={tagsValue} placeholder="refusal, politeness, friendship" />
		</div>

		<!-- materialsMd with preview -->
		<div class="space-y-2">
			<div class="flex items-center justify-between">
				<Label for="materialsMd">Background Material (Markdown)</Label>
				<button
					type="button"
					onclick={() => (showMdPreview = !showMdPreview)}
					class="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
				>
					{showMdPreview ? "Edit" : "Preview"}
				</button>
			</div>
			{#if showMdPreview}
				<div class="prose prose-neutral min-h-[100px] max-w-none rounded-md border border-input bg-background px-3 py-2 text-sm">{@html mdHtml}</div>
			{:else}
				<Textarea
					id="materialsMd"
					name="materialsMd"
					rows={6}
					bind:value={mdSource}
					placeholder="## Background&#10;&#10;Write your learning material in Markdown..."
				/>
			{/if}
		</div>
	</fieldset>

	<!-- Passages (translate mode only) -->
	{#if isTranslate}
		<div class="space-y-2">
			<Label for="translationBase">Source Text (one sentence per line, empty line = new paragraph)</Label>
			<Textarea
				id="translationBase"
				name="translationBase"
				rows={10}
				value={(template.translationBase ?? []).map((p) => p.join("\n")).join("\n\n")}
				placeholder="The sun was setting behind the mountains.&#10;The sky turned a deep shade of orange.&#10;&#10;She walked along the riverbank.&#10;The water reflected the fading light."
			/>
			<p class="text-xs text-muted-foreground">Each line = one sentence. Blank line = paragraph break.</p>
		</div>
	{/if}

	<!-- Create mode: First Variant (INSIDE the form) -->
	{#if !isEditMode && !isTranslate}
		<fieldset class="space-y-4 rounded-md border border-input p-4">
			<h2 class="uppercase tracking-widest text-muted-foreground px-1">First Variant</h2>
			<p class="text-xs text-muted-foreground">
				Every template requires at least one active variant. Define the slot values and opening state below — they will be created together with the
				template.
			</p>

			<div class="space-y-3">
				<div class="space-y-2">
					<Label>Slot Values</Label>
					<SlotEditor bind:value={firstVariantSlots} {requiredSlots} name="firstVariantSlotValues" />
				</div>

				<div class="space-y-2">
					<Label>Opening State</Label>
					<OpeningStateEditor bind:value={firstVariantOpeningState} ui={selectedUi} name="firstVariantOpeningState" />
				</div>
			</div>
		</fieldset>
	{/if}

	<!-- Submit -->
	<div class="flex items-center gap-3">
		{#if isEditMode && hasDirtyVariants}
			<p class="text-sm text-amber-600">Unsaved variant changes (#{dirtyVariantIds.join(", #")}). Save variants before saving template.</p>
		{/if}
		<Button type="submit" disabled={isEditMode && hasDirtyVariants}>{submitLabel}</Button>
		<Button href="/admin/templates" variant="outline">Cancel</Button>
	</div>
</form>

<!-- Section C: Variants (edit mode only — separate forms, outside the main form) -->
{#if isEditMode && !isTranslate}
	<div class="mt-8 space-y-4">
		<div class="flex items-center justify-between">
			<h2 class="uppercase tracking-widest text-muted-foreground">Variants</h2>
			<button
				type="button"
				onclick={() => (showAddVariant = !showAddVariant)}
				class="text-sm text-primary underline underline-offset-2 hover:opacity-80"
			>
				{showAddVariant ? "Cancel" : "+ Add Variant"}
			</button>
		</div>

		<!-- Existing variants -->
		{#each variants as v (v.id)}
			{@const draft = getVariantDraft(v.id)}
			{@const dirty = isVariantDirty(v.id)}
			<div
				class="rounded-md border border-input p-4 space-y-3 {!v.isActive
					? 'opacity-50'
					: ''}"
			>
				<div class="flex items-center justify-between">
					<span class="text-sm font-medium">
						Variant #{v.id}
						{v.isActive ? "" : "(inactive)"}
						{#if dirty}
							<span class="ml-2 text-xs text-amber-600">(unsaved)</span>
						{/if}
					</span>
					<div class="flex gap-2">
						<button
							type="button"
							onclick={() =>
								(editingVariantId =
									editingVariantId === v.id ? null : v.id)}
							class="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
						>
							{editingVariantId === v.id ? "Close" : "Edit"}
						</button>
						{#if v.isActive}
							<form method="POST" action="?/deactivateVariant" use:enhance>
								<input type="hidden" name="variantId" value={v.id}>
								<button type="submit" class="text-xs text-red-500 underline underline-offset-2 hover:opacity-80">Deactivate</button>
							</form>
						{:else}
							<form method="POST" action="?/activateVariant" use:enhance>
								<input type="hidden" name="variantId" value={v.id}>
								<button type="submit" class="text-xs text-green-600 underline underline-offset-2 hover:opacity-80">Activate</button>
							</form>
						{/if}
					</div>
				</div>

				{#if editingVariantId === v.id}
					<form method="POST" action="?/saveVariant" use:enhance class="space-y-4">
						<input type="hidden" name="variantId" value={v.id}>

						<div class="space-y-2">
							<Label>Slot Values</Label>
							<SlotEditor
								value={draft.slotValues}
								{requiredSlots}
								name="slotValues"
								onchange={(slots) =>
									updateDraftSlots(v.id, slots)}
							/>
						</div>

						<div class="space-y-2">
							<Label>Opening State</Label>
							<OpeningStateEditor
								value={draft.openingState}
								ui={selectedUi}
								name="openingState"
								onchange={(state) =>
									updateDraftOpeningState(
										v.id,
										state as Record<string, unknown>,
									)}
							/>
						</div>

						<Button type="submit" size="sm">Save Variant</Button>
					</form>
				{:else}
					<div class="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
						<div>
							<span class="font-medium text-foreground">Slot Values:</span>
							<pre class="mt-1 overflow-auto max-h-20 rounded bg-muted px-2 py-1">{jsonStr(
									v.slotValues,
								)}</pre>
						</div>
						<div>
							<span class="font-medium text-foreground">Opening State:</span>
							<pre class="mt-1 overflow-auto max-h-20 rounded bg-muted px-2 py-1">{jsonStr(
									v.openingState,
								)}</pre>
						</div>
					</div>
				{/if}
			</div>
		{/each}

		<!-- Add new variant -->
		{#if showAddVariant}
			<div class="rounded-md border border-dashed border-input p-4 space-y-4">
				<p class="text-sm font-medium">New Variant</p>
				<form method="POST" action="?/addVariant" use:enhance class="space-y-4">
					<div class="space-y-2">
						<Label>Slot Values</Label>
						<SlotEditor bind:value={newVariantSlots} {requiredSlots} name="slotValues" />
					</div>

					<div class="space-y-2">
						<Label>Opening State</Label>
						<OpeningStateEditor bind:value={newVariantOpeningState} ui={selectedUi} name="openingState" />
					</div>

					<Button type="submit" size="sm">Add Variant</Button>
				</form>
			</div>
		{/if}
	</div>
{/if}
