<script lang="ts" module>
export type TaskFormData = {
	id?: number;
	updatedAt?: Date | string;
	language?: string;
	interactionType?: string;
	urgency?: string | null;
	ui?: string;
	difficulty?: number;
	maxTurns?: number | null;
	estimatedWords?: number | null;
	title?: string;
	shortObjective?: string | null;
	description?: string | null;
	agentPrompt?: string | null;
	materialsMd?: string | null;
	objectives?: string[] | null;
	tags?: string[] | null;
	openingState?: Record<string, unknown> | null;
	referenceParagraphs?: string[] | null;
	translationContext?: string | null;
	rotation?: string;
};
</script>

<script lang="ts">
import { untrack } from "svelte";
import { enhance } from "$app/forms";
import { base } from "$app/paths";
import { getDefaultOpeningState } from "$lib/admin/opening-state";
import { handleInvalidField } from "$lib/client/form-attention";
import ActionNotification from "$lib/components/ActionNotification.svelte";
import FormErrorFocus from "$lib/components/FormErrorFocus.svelte";
import OpeningStateEditor from "$lib/components/OpeningStateEditor.svelte";
import BottomSheet from "$lib/components/ui/bottom-sheet/BottomSheet.svelte";
import { Button } from "$lib/components/ui/button";
import { Input } from "$lib/components/ui/input";
import { Label } from "$lib/components/ui/label";
import { Textarea } from "$lib/components/ui/textarea";
import {
	CHAT_UI_VARIANTS,
	type ChatUiVariant,
	INTERACTION_TYPE_LABELS,
	INTERACTION_TYPES,
	LANGUAGE_CODES,
	LANGUAGE_LABELS,
	LINEUP_KIND_LABELS,
	LINEUP_KINDS,
	UI_VARIANT_LABELS,
	URGENCIES,
	URGENCY_LABELS,
} from "$lib/constants";
import { renderMarkdown } from "$lib/markdown";

interface Props {
	task?: TaskFormData;
	form?: {
		message?: string;
		errors?: Record<string, string[] | undefined>;
	} | null;
	action?: string;
	submitLabel?: string;
	cancelHref?: string;
	/** Contributors never see scheduling, scoring, or agent-prompt fields. */
	hideAdminFields?: boolean;
	confirmBeforeSubmit?: boolean;
	/** Extra hidden fields added inside the form */
	extraHiddenFields?: Record<string, string>;
	/** Changes when external task data should replace local draft state */
	resetKey?: string;
}

let {
	task = {} as TaskFormData,
	form = null,
	action = "",
	submitLabel = "Save",
	cancelHref = `${base}/admin/tasks`,
	hideAdminFields = false,
	confirmBeforeSubmit = false,
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

const actionNotification = $derived(form?.message ? { variant: "error" as const, title: "Unable to save task", message: form.message } : null);

const taskFieldOrder = [
	"language",
	"interactionType",
	"urgency",
	"ui",
	"rotation",
	"difficulty",
	"maxTurns",
	"estimatedWords",
	"title",
	"shortObjective",
	"description",
	"translationContext",
	"agentPrompt",
	"objectives",
	"tags",
	"materialsMd",
	"referenceParagraphs",
	"openingState",
];

function taskSourceKey() {
	return resetKey ?? JSON.stringify(task ?? {});
}

function numberFieldValue(value: number | null | undefined, fallback = "") {
	return value === null || value === undefined ? fallback : String(value);
}

function chatUi(value: string | undefined): ChatUiVariant {
	return CHAT_UI_VARIANTS.includes(value as ChatUiVariant) ? (value as ChatUiVariant) : "reddit";
}

let selectedLanguage = $state<string>(untrack(() => task.language ?? "en"));
let selectedInteractionType = $state<string>(untrack(() => task.interactionType ?? "chat"));
let selectedUrgency = $state<string>(untrack(() => task.urgency ?? "high"));
let selectedUi = $state<ChatUiVariant>(untrack(() => chatUi(task.ui)));
let selectedRotation = $state<string>(untrack(() => task.rotation ?? "none"));
let difficultyValue = $state(untrack(() => numberFieldValue(task.difficulty, "1")));
let maxTurnsValue = $state(untrack(() => numberFieldValue(task.maxTurns)));
let estimatedWordsValue = $state(untrack(() => numberFieldValue(task.estimatedWords)));
let title = $state(untrack(() => task.title ?? ""));
let shortObjective = $state(untrack(() => task.shortObjective ?? ""));
let description = $state(untrack(() => task.description ?? ""));
let agentPrompt = $state(untrack(() => task.agentPrompt ?? ""));
let translationContext = $state(untrack(() => task.translationContext ?? ""));
let objectivesText = $state(untrack(() => (task.objectives ?? []).join("\n")));
let tagsText = $state(untrack(() => (task.tags ?? []).join(", ")));
let referenceText = $state(untrack(() => (task.referenceParagraphs ?? []).join("\n\n")));
let openingState = $state<Record<string, unknown>>(
	untrack(() => task.openingState ?? (getDefaultOpeningState(chatUi(task.ui)) as Record<string, unknown>)),
);

let isTranslate = $derived(selectedInteractionType === "translate");

// Markdown preview
let showMdPreview = $state(false);
let mdSource = $state(untrack(() => task.materialsMd ?? ""));
let mdHtml = $derived(showMdPreview ? renderMarkdown(mdSource) : "");

function syncTaskDraftFromProps() {
	selectedLanguage = task.language ?? "en";
	selectedInteractionType = task.interactionType ?? "chat";
	selectedUrgency = task.urgency ?? "high";
	selectedUi = chatUi(task.ui);
	selectedRotation = task.rotation ?? "none";
	difficultyValue = numberFieldValue(task.difficulty, "1");
	maxTurnsValue = numberFieldValue(task.maxTurns);
	estimatedWordsValue = numberFieldValue(task.estimatedWords);
	title = task.title ?? "";
	shortObjective = task.shortObjective ?? "";
	description = task.description ?? "";
	agentPrompt = task.agentPrompt ?? "";
	translationContext = task.translationContext ?? "";
	objectivesText = (task.objectives ?? []).join("\n");
	tagsText = (task.tags ?? []).join(", ");
	referenceText = (task.referenceParagraphs ?? []).join("\n\n");
	openingState = task.openingState ?? (getDefaultOpeningState(chatUi(task.ui)) as Record<string, unknown>);
	mdSource = task.materialsMd ?? "";
}

let lastTaskSourceKey = $state<string | null>(null);
$effect(() => {
	const key = taskSourceKey();
	if (key === lastTaskSourceKey) return;
	lastTaskSourceKey = key;
	syncTaskDraftFromProps();
});
</script>

<ActionNotification notification={actionNotification} />
<FormErrorFocus formRef={mainFormEl} errors={form?.errors} fieldOrder={taskFieldOrder} />

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
					<p data-field-error="language" class="text-sm text-red-600">{form.errors.language[0]}</p>
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
					<p data-field-error="interactionType" class="text-sm text-red-600">{form.errors.interactionType[0]}</p>
				{/if}
			</div>

			{#if isTranslate}
				<input type="hidden" name="ui" value="translator">
			{:else}
				<div class="space-y-2">
					<Label for="ui">Interface</Label>
					<select
						id="ui"
						name="ui"
						class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
						required
						bind:value={selectedUi}
					>
						{#each CHAT_UI_VARIANTS as variant}
							<option value={variant}>{UI_VARIANT_LABELS[variant]}</option>
						{/each}
					</select>
					{#if form?.errors?.ui}
						<p data-field-error="ui" class="text-sm text-red-600">{form.errors.ui[0]}</p>
					{/if}
				</div>

				<div class="space-y-2">
					<Label for="urgency">Reply urgency</Label>
					<select
						id="urgency"
						name="urgency"
						class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
						required
						bind:value={selectedUrgency}
					>
						{#each URGENCIES as urgency}
							<option value={urgency}>{URGENCY_LABELS[urgency]}</option>
						{/each}
					</select>
					{#if form?.errors?.urgency}
						<p data-field-error="urgency" class="text-sm text-red-600">{form.errors.urgency[0]}</p>
					{/if}
				</div>
			{/if}

			{#if !hideAdminFields}
				{#if !isTranslate}
					<div class="space-y-2">
						<Label for="rotation">Auto rotation</Label>
						<select
							id="rotation"
							name="rotation"
							class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
							bind:value={selectedRotation}
						>
							<option value="none">None (manual lineups only)</option>
							{#each LINEUP_KINDS as kind}
								<option value={kind}>{LINEUP_KIND_LABELS[kind]}</option>
							{/each}
						</select>
					</div>
				{/if}

				<div class="space-y-2">
					<Label for="difficulty">Difficulty (1–3)</Label>
					<Input id="difficulty" name="difficulty" type="number" min="1" max="3" bind:value={difficultyValue} required />
					{#if form?.errors?.difficulty}
						<p data-field-error="difficulty" class="text-sm text-red-600">{form.errors.difficulty[0]}</p>
					{/if}
				</div>

				{#if !isTranslate}
					<div class="space-y-2">
						<Label for="maxTurns">Max Turns (blank for no limit)</Label>
						<Input id="maxTurns" name="maxTurns" type="number" min="0" bind:value={maxTurnsValue} />
						{#if form?.errors?.maxTurns}
							<p data-field-error="maxTurns" class="text-sm text-red-600">{form.errors.maxTurns[0]}</p>
						{/if}
					</div>
				{/if}

				<div class="space-y-2">
					<Label for="estimatedWords">Estimated Words</Label>
					<Input id="estimatedWords" name="estimatedWords" type="number" min="0" bind:value={estimatedWordsValue} />
					{#if form?.errors?.estimatedWords}
						<p data-field-error="estimatedWords" class="text-sm text-red-600">{form.errors.estimatedWords[0]}</p>
					{/if}
				</div>
			{/if}
		</div>
	</fieldset>

	<!-- Section B: Content -->
	<fieldset class="space-y-4">
		<h2 class="uppercase tracking-widest text-muted-foreground">Content</h2>

		<div class="space-y-2">
			<Label for="title">Title</Label>
			<Input id="title" name="title" bind:value={title} required />
			{#if form?.errors?.title}
				<p data-field-error="title" class="text-sm text-red-600">{form.errors.title[0]}</p>
			{/if}
		</div>

		{#if !isTranslate}
			<div class="space-y-2">
				<Label for="shortObjective">Short Objective (1–2 sentences, shown on card)</Label>
				<Textarea id="shortObjective" name="shortObjective" rows={2} bind:value={shortObjective} />
			</div>
		{/if}

		<div class="space-y-2">
			<Label for="description">Description</Label>
			<Textarea id="description" name="description" rows={3} bind:value={description} />
			{#if form?.errors?.description}
				<p data-field-error="description" class="text-sm text-red-600">{form.errors.description[0]}</p>
			{/if}
		</div>

		{#if isTranslate}
			<div class="space-y-2">
				<Label for="translationContext">Translation Context</Label>
				<div class="grid grid-cols-1 items-start gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm sm:grid-cols-[auto_1fr_auto]">
					<span class="pt-2 text-muted-foreground">This is in the context of [</span>
					<Input id="translationContext" name="translationContext" bind:value={translationContext} required />
					<span class="pt-2 text-muted-foreground">].</span>
				</div>
				{#if form?.errors?.translationContext}
					<p data-field-error="translationContext" class="text-sm text-red-600">{form.errors.translationContext[0]}</p>
				{/if}
			</div>
		{:else if !hideAdminFields}
			<div class="space-y-2">
				<Label for="agentPrompt">Agent Prompt</Label>
				<Textarea id="agentPrompt" name="agentPrompt" rows={4} bind:value={agentPrompt} />
				{#if form?.errors?.agentPrompt}
					<p data-field-error="agentPrompt" class="text-sm text-red-600">{form.errors.agentPrompt[0]}</p>
				{/if}
			</div>
		{/if}

		{#if !isTranslate}
			<div class="space-y-2">
				<Label for="objectives">Objectives (one per line)</Label>
				<Textarea
					id="objectives"
					name="objectives"
					rows={4}
					bind:value={objectivesText}
					placeholder="Give a convincing reason&#10;Do not over-explain&#10;Show you still value the friendship"
				/>
				{#if form?.errors?.objectives}
					<p data-field-error="objectives" class="text-sm text-red-600">{form.errors.objectives[0]}</p>
				{/if}
			</div>
		{/if}

		<div class="space-y-2">
			<Label for="tags">Tags (comma-separated)</Label>
			<Input id="tags" name="tags" bind:value={tagsText} placeholder="refusal, politeness, friendship" />
		</div>

		{#if !isTranslate}
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
					<input type="hidden" name="materialsMd" value={mdSource}>
					<div class="prose prose-neutral min-h-[100px] max-w-none rounded-md border border-input bg-background px-3 py-2 text-sm">
						{@html mdHtml}
					</div>
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
		{/if}
	</fieldset>

	{#if isTranslate}
		<div class="space-y-2">
			<Label for="referenceParagraphs">Authentic Reference Text ({LANGUAGE_LABELS[selectedLanguage as keyof typeof LANGUAGE_LABELS]})</Label>
			<Textarea
				id="referenceParagraphs"
				name="referenceParagraphs"
				rows={10}
				bind:value={referenceText}
				required
				placeholder="The sun was setting behind the mountains. The sky turned a deep shade of orange.&#10;&#10;She walked along the riverbank. The water reflected the fading light."
			/>
			<p class="text-xs text-muted-foreground">Separate paragraphs with a blank line. Store only authentic text in the task language.</p>
			{#if form?.errors?.referenceParagraphs}
				<p data-field-error="referenceParagraphs" class="text-sm text-red-600">{form.errors.referenceParagraphs[0]}</p>
			{/if}
		</div>
	{:else}
		<fieldset class="space-y-4">
			<h2 class="uppercase tracking-widest text-muted-foreground">Opening State</h2>
			<p class="text-xs text-muted-foreground">What the learner sees in the {UI_VARIANT_LABELS[selectedUi]} interface when the scenario opens.</p>
			<OpeningStateEditor bind:value={openingState} ui={selectedUi} name="openingState" />
			{#if form?.errors?.openingState}
				<p data-field-error="openingState" class="text-sm text-red-600">{form.errors.openingState[0]}</p>
			{/if}
		</fieldset>
	{/if}

	<!-- Submit -->
	<div class="flex items-center gap-3">
		<Button type="submit">{submitLabel}</Button>
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
						<Label class="text-xs text-muted-foreground">Interface</Label>
						<p class="text-sm">{isTranslate ? UI_VARIANT_LABELS.translator : UI_VARIANT_LABELS[selectedUi]}</p>
					</div>
				</div>
				<div class="space-y-1">
					<Label class="text-xs text-muted-foreground">Title</Label>
					<p class="text-sm">{title}</p>
				</div>
				{#if !isTranslate && shortObjective}
					<div class="space-y-1">
						<Label class="text-xs text-muted-foreground">Short Objective</Label>
						<p class="text-sm">{shortObjective}</p>
					</div>
				{/if}
			</div>
		{/snippet}
	</BottomSheet>
{/if}
