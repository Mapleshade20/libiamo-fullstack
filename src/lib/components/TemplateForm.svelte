<script lang="ts">
import { untrack } from "svelte";
import { enhance } from "$app/forms";
import { extractSlotNames, getDefaultOpeningState, type UiVariant } from "$lib/admin/variant-helpers";
import { handleInvalidField } from "$lib/client/form-attention";
import ActionNotification from "$lib/components/ActionNotification.svelte";
import FormErrorFocus from "$lib/components/FormErrorFocus.svelte";
import OpeningStateEditor from "$lib/components/OpeningStateEditor.svelte";
import SlotEditor from "$lib/components/SlotEditor.svelte";
import BottomSheet from "$lib/components/ui/bottom-sheet/BottomSheet.svelte";
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
	id?: number;
	updatedAt?: Date | string;
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
		action?: string;
		message?: string;
		errors?: Record<string, string[]>;
	} | null;
	action?: string;
	submitLabel?: string;
	cancelHref?: string;
	hideAdminFields?: boolean;
	confirmBeforeSubmit?: boolean;
	/** Pre-fill variant slots in create mode */
	initialSlotValues?: Record<string, string>;
	/** Pre-fill opening state in create mode */
	initialOpeningState?: Record<string, unknown>;
	/** Extra hidden fields added inside the form */
	extraHiddenFields?: Record<string, string>;
	/** Changes when external template data should replace local draft state */
	resetKey?: string;
}

let {
	template = {} as TemplateData,
	variants = [],
	form = null,
	action = "",
	submitLabel = "Save",
	cancelHref = "/admin/templates",
	hideAdminFields = false,
	confirmBeforeSubmit = false,
	initialSlotValues,
	initialOpeningState,
	extraHiddenFields,
	resetKey,
}: Props = $props();
let mainFormEl: HTMLFormElement | null = $state(null);
let showConfirm = $state(false);
let confirmed = $state(false);

$effect(() => {
	if (!mainFormEl) return;
	const handler = (e: KeyboardEvent) => {
		const t = e.target as HTMLInputElement;
		if (e.key === "Enter" && t instanceof HTMLInputElement && !["checkbox", "radio", "button", "submit", "reset"].includes(t.type))
			e.preventDefault();
	};
	mainFormEl.addEventListener("keydown", handler);
	return () => mainFormEl?.removeEventListener("keydown", handler);
});

function templateFormErrorTitle(action: string | undefined) {
	switch (action) {
		case "importJson":
			return null;
		case "addVariant":
			return "Unable to add variant";
		case "saveVariant":
			return "Unable to save variant";
		case "deleteVariant":
			return "Unable to delete variant";
		case "activateVariant":
			return "Unable to activate variant";
		case "deactivateVariant":
			return "Unable to deactivate variant";
		default:
			return "Unable to save template";
	}
}

const actionNotification = $derived.by(() => {
	if (!form?.message) return null;
	const title = templateFormErrorTitle(form.action);
	return title ? { variant: "error" as const, title, message: form.message } : null;
});

const templateFieldOrder = [
	"language",
	"interactionType",
	"ui",
	"cadence",
	"difficulty",
	"pointReward",
	"gemReward",
	"titleBase",
	"shortObjectiveBase",
	"descriptionBase",
	"agentPromptBase",
	"objectivesBase",
	"translationBase",
	"tags",
];

const isEditMode = $derived("id" in template);

function templateSourceKey() {
	return resetKey ?? JSON.stringify(template ?? {});
}

function numberFieldValue(value: number | null | undefined, fallback = "") {
	return value === null || value === undefined ? fallback : String(value);
}

// ── Tracked form field values for slot extraction ────────────────
let titleBase = $state(untrack(() => template.titleBase ?? ""));
let shortObjectiveBase = $state(untrack(() => template.shortObjectiveBase ?? ""));
let descriptionBase = $state(untrack(() => template.descriptionBase ?? ""));
let agentPromptBase = $state(untrack(() => template.agentPromptBase ?? ""));
let objectivesText = $state(untrack(() => (template.objectivesBase ?? []).join("\n")));
let tagsText = $state(untrack(() => (template.tags ?? []).join(", ")));
let translationText = $state(untrack(() => (template.translationBase ?? []).map((p) => p.join("\n")).join("\n\n")));

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

// ── Language tracking ────────────────────────────────────────────
let selectedLanguage = $state<string>(untrack(() => template.language ?? "en"));

// ── Interaction type tracking ────────────────────────────────────
let selectedInteractionType = $state<string>(untrack(() => template.interactionType ?? "chat"));

let isTranslate = $derived(selectedInteractionType === "translate");

// ── UI variant tracking ──────────────────────────────────────────
let selectedUi = $state<UiVariant>(untrack(() => (template.ui as UiVariant) ?? "reddit"));
let selectedCadence = $state<string>(untrack(() => template.cadence ?? "daily"));
let difficultyValue = $state(untrack(() => numberFieldValue(template.difficulty, "1")));
let maxTurnsValue = $state(untrack(() => numberFieldValue(template.maxTurns)));
let estimatedWordsValue = $state(untrack(() => numberFieldValue(template.estimatedWords)));
let pointRewardValue = $state(untrack(() => numberFieldValue(template.pointReward, "3")));
let gemRewardValue = $state(untrack(() => numberFieldValue(template.gemReward, "30")));
let isActiveValue = $state(untrack(() => template.isActive ?? true));
let agentStartsFirstValue = $state(untrack(() => template.agentStartsFirst ?? true));

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
let mdHtml = $derived(showMdPreview ? renderMarkdown(mdSource) : "");

function syncTemplateDraftFromProps() {
	selectedLanguage = template.language ?? "en";
	selectedInteractionType = template.interactionType ?? "chat";
	selectedUi = (template.ui as UiVariant) ?? "reddit";
	selectedCadence = template.cadence ?? "daily";
	difficultyValue = numberFieldValue(template.difficulty, "1");
	maxTurnsValue = numberFieldValue(template.maxTurns);
	estimatedWordsValue = numberFieldValue(template.estimatedWords);
	pointRewardValue = numberFieldValue(template.pointReward, "3");
	gemRewardValue = numberFieldValue(template.gemReward, "30");
	isActiveValue = template.isActive ?? true;
	agentStartsFirstValue = template.agentStartsFirst ?? true;
	titleBase = template.titleBase ?? "";
	shortObjectiveBase = template.shortObjectiveBase ?? "";
	descriptionBase = template.descriptionBase ?? "";
	agentPromptBase = template.agentPromptBase ?? "";
	objectivesText = (template.objectivesBase ?? []).join("\n");
	tagsText = (template.tags ?? []).join(", ");
	translationText = (template.translationBase ?? []).map((p) => p.join("\n")).join("\n\n");
	mdSource = template.materialsMd ?? "";
}

let lastTemplateSourceKey = $state<string | null>(null);
$effect(() => {
	const key = templateSourceKey();
	if (key === lastTemplateSourceKey) return;
	lastTemplateSourceKey = key;
	syncTemplateDraftFromProps();
});

// ── Variant editing state (edit mode) ────────────────────────────
let editingVariantId = $state<number | null>(null);
let showAddVariant = $state(false);
let pendingDeleteVariantId = $state<number | null>(null);
let pendingDeleteVariantForm: HTMLFormElement | null = $state(null);
let deleteVariantConfirmed = $state(false);

const pendingDeleteVariant = $derived(variants.find((variant) => variant.id === pendingDeleteVariantId) ?? null);

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
let firstVariantSlots = $state(untrack(() => initialSlotValues ?? {}));
let firstVariantOpeningState = $state(untrack(() => initialOpeningState ?? {}));

// Reset opening state when UI changes in create mode
$effect(() => {
	if (!isEditMode && !initialOpeningState) {
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

function enhanceWithoutReset() {
	return async ({ update }: { update: (options?: { reset?: boolean; invalidateAll?: boolean }) => Promise<void> }) => update({ reset: false });
}

function enhanceVariantSave(variantId: number) {
	return () =>
		async ({ result, update }: { result: { type: string }; update: (options?: { reset?: boolean; invalidateAll?: boolean }) => Promise<void> }) => {
			await update({ reset: false });
			if (result.type === "success") editingVariantId = editingVariantId === variantId ? null : editingVariantId;
		};
}

function enhanceAddVariant() {
	return async ({
		result,
		update,
	}: {
		result: { type: string };
		update: (options?: { reset?: boolean; invalidateAll?: boolean }) => Promise<void>;
	}) => {
		await update({ reset: false });
		if (result.type === "success") {
			showAddVariant = false;
			newVariantSlots = {};
			newVariantOpeningState = getDefaultOpeningState(selectedUi) as Record<string, unknown>;
		}
	};
}

function enhanceDeleteVariant(variantId: number) {
	return ({ cancel, formElement }: { cancel: () => void; formElement: HTMLFormElement }) => {
		if (!deleteVariantConfirmed) {
			cancel();
			pendingDeleteVariantId = variantId;
			pendingDeleteVariantForm = formElement;
			return;
		}

		deleteVariantConfirmed = false;
		return async ({
			result,
			update,
		}: {
			result: { type: string };
			update: (options?: { reset?: boolean; invalidateAll?: boolean }) => Promise<void>;
		}) => {
			await update({ reset: false });
			if (result.type === "success" && editingVariantId === variantId) editingVariantId = null;
		};
	};
}

function cancelDeleteVariant() {
	pendingDeleteVariantId = null;
	pendingDeleteVariantForm = null;
	deleteVariantConfirmed = false;
}

function confirmDeleteVariant() {
	if (!pendingDeleteVariantForm) return;
	deleteVariantConfirmed = true;
	const formElement = pendingDeleteVariantForm;
	pendingDeleteVariantId = null;
	pendingDeleteVariantForm = null;
	formElement.requestSubmit();
}
</script>

<ActionNotification notification={actionNotification} />
<FormErrorFocus formRef={mainFormEl} errors={form?.errors} fieldOrder={templateFieldOrder} />

<form
	method="POST"
	{action}
	use:enhance={({ cancel }) => {
		if (confirmBeforeSubmit && !confirmed) {
			cancel();
			showConfirm = true;
			return;
		}
		confirmed = false;
		return async ({ update }) => update({ reset: false });
	}}
	class="space-y-8"
	bind:this={mainFormEl}
	oninvalidcapture={handleInvalidField}
>
	{#if extraHiddenFields}
		{#each Object.entries(extraHiddenFields) as [ name, val ]}
			<input type="hidden" {name} value={val}>
		{/each}
	{/if}

	<!-- Section A: Metadata -->
	<fieldset class="space-y-4">
		<h2 class="uppercase tracking-widest text-muted-foreground">Metadata</h2>
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
			<div class="space-y-2">
				<Label for="language">Language</Label>
				<select
					id="language"
					name="language"
					class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
					required
					bind:value={selectedLanguage}
				>
					{#each LANGUAGE_CODES as code}
						<option value={code}>{LANGUAGE_LABELS[code]}</option>
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

			{#if !hideAdminFields}
				{#if !isTranslate}
					<div class="space-y-2">
						<Label for="cadence">Cadence</Label>
						<select
							id="cadence"
							name="cadence"
							class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
							required
							bind:value={selectedCadence}
						>
							{#each CADENCES as cadence}
								<option value={cadence}>{cadence === "none" ? "None" : cadence.charAt(0).toUpperCase() + cadence.slice(1)}</option>
							{/each}
						</select>
						{#if form?.errors?.cadence}
							<p class="text-sm text-red-600">{form.errors.cadence[0]}</p>
						{/if}
					</div>
				{:else}
					<input type="hidden" name="cadence" value="none">
				{/if}
			{/if}

			{#if !hideAdminFields}
				<div class="space-y-2">
					<Label for="difficulty">Difficulty (1–3)</Label>
					<Input id="difficulty" name="difficulty" type="number" min="1" max="3" bind:value={difficultyValue} required />
					{#if form?.errors?.difficulty}
						<p class="text-sm text-red-600">{form.errors.difficulty[0]}</p>
					{/if}
				</div>
			{/if}

			{#if !isTranslate && !hideAdminFields}
				<div class="space-y-2">
					<Label for="maxTurns">Max Turns</Label>
					<Input id="maxTurns" name="maxTurns" type="number" min="0" bind:value={maxTurnsValue} />
				</div>
			{/if}

			{#if !hideAdminFields}
				<div class="space-y-2">
					<Label for="estimatedWords">Estimated Words</Label>
					<Input id="estimatedWords" name="estimatedWords" type="number" min="0" bind:value={estimatedWordsValue} />
				</div>

				<div class="space-y-2">
					<Label for="pointReward">Point Reward</Label>
					<Input id="pointReward" name="pointReward" type="number" min="0" bind:value={pointRewardValue} required />
					{#if form?.errors?.pointReward}
						<p class="text-sm text-red-600">{form.errors.pointReward[0]}</p>
					{/if}
				</div>

				<div class="space-y-2">
					<Label for="gemReward">Gem Reward</Label>
					<Input id="gemReward" name="gemReward" type="number" min="0" bind:value={gemRewardValue} required />
					{#if form?.errors?.gemReward}
						<p class="text-sm text-red-600">{form.errors.gemReward[0]}</p>
					{/if}
				</div>

				<div class="flex items-center gap-2 pt-6">
					<input id="isActive" name="isActive" type="checkbox" bind:checked={isActiveValue} class="rounded border-input">
					<Label for="isActive">Active</Label>
				</div>
			{/if}
			{#if !hideAdminFields}
				<div class="flex items-center gap-2 pt-6">
					<input id="agentStartsFirst" name="agentStartsFirst" type="checkbox" bind:checked={agentStartsFirstValue} class="rounded border-input">
					<Label for="agentStartsFirst" class="cursor-pointer">Agent Starts First (Auto-Greeting)</Label>
				</div>
			{/if}
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

		{#if !isTranslate && !hideAdminFields}
			<div class="space-y-2">
				<Label for="agentPromptBase"> Agent Prompt (MBTI persona prefix injected automatically at session start) </Label>
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
			<Input id="tags" name="tags" bind:value={tagsText} placeholder="refusal, politeness, friendship" />
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
				bind:value={translationText}
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
		<Button href={cancelHref} variant="outline">Cancel</Button>
	</div>
</form>

{#if confirmBeforeSubmit}
	<BottomSheet
		show={showConfirm}
		title="Submit for Review?"
		confirmLabel="Submit"
		cancelLabel="Go Back"
		onConfirm={() => { confirmed = true; showConfirm = false; mainFormEl?.requestSubmit(); }}
		onCancel={() => { showConfirm = false; }}
	>
		{#snippet children()}
			<div class="space-y-3">
				<div class="grid gap-3 sm:grid-cols-2">
					<div class="space-y-1">
						<Label class="text-xs text-muted-foreground">Language</Label>
						<p class="text-sm">{LANGUAGE_LABELS[selectedLanguage as keyof typeof LANGUAGE_LABELS] ?? selectedLanguage}</p>
					</div>
					<div class="space-y-1">
						<Label class="text-xs text-muted-foreground">Interaction Type</Label>
						<p class="text-sm">
							{INTERACTION_TYPE_LABELS[selectedInteractionType as keyof typeof INTERACTION_TYPE_LABELS] ?? selectedInteractionType}
						</p>
					</div>
					<div class="space-y-1">
						<Label class="text-xs text-muted-foreground">UI</Label>
						<p class="text-sm">{UI_VARIANT_LABELS[selectedUi] ?? selectedUi}</p>
					</div>
				</div>
				<div class="space-y-1">
					<Label class="text-xs text-muted-foreground">Title</Label>
					<p class="text-sm">{titleBase}</p>
				</div>
				{#if shortObjectiveBase}
					<div class="space-y-1">
						<Label class="text-xs text-muted-foreground">Short Objective</Label>
						<p class="text-sm">{shortObjectiveBase}</p>
					</div>
				{/if}
			</div>
		{/snippet}
	</BottomSheet>
{/if}

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
							<form method="POST" action="?/deactivateVariant" use:enhance={enhanceWithoutReset}>
								<input type="hidden" name="variantId" value={v.id}>
								<button type="submit" class="text-xs text-red-500 underline underline-offset-2 hover:opacity-80">Deactivate</button>
							</form>
						{:else}
							<form method="POST" action="?/activateVariant" use:enhance={enhanceWithoutReset}>
								<input type="hidden" name="variantId" value={v.id}>
								<button type="submit" class="text-xs text-green-600 underline underline-offset-2 hover:opacity-80">Activate</button>
							</form>
						{/if}
						<form method="POST" action="?/deleteVariant" use:enhance={enhanceDeleteVariant(v.id)}>
							<input type="hidden" name="variantId" value={v.id}>
							<button type="submit" class="text-xs text-destructive underline underline-offset-2 hover:opacity-80">Delete</button>
						</form>
					</div>
				</div>

				{#if editingVariantId === v.id}
					<form method="POST" action="?/saveVariant" use:enhance={enhanceVariantSave(v.id)} class="space-y-4">
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
				<form method="POST" action="?/addVariant" use:enhance={enhanceAddVariant} class="space-y-4">
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

<BottomSheet
	show={pendingDeleteVariant !== null}
	title="Delete Variant?"
	confirmLabel="Delete Variant"
	cancelLabel="Cancel"
	onConfirm={confirmDeleteVariant}
	onCancel={cancelDeleteVariant}
>
	{#snippet children()}
		<div class="space-y-3 text-sm text-muted-foreground">
			<p>Variant #{pendingDeleteVariant?.id} will be permanently removed if it has no scheduled tasks or practice history.</p>
			<p>Used variants are blocked by the server and can remain inactive instead.</p>
		</div>
	{/snippet}
</BottomSheet>
