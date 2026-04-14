<script lang="ts">
import { marked } from "marked";
import { untrack } from "svelte";
import { enhance } from "$app/forms";
import { Button } from "$lib/components/ui/button";
import { Input } from "$lib/components/ui/input";
import { Label } from "$lib/components/ui/label";
import { Textarea } from "$lib/components/ui/textarea";

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
	titleBase?: string;
	shortObjectiveBase?: string | null;
	descriptionBase?: string | null;
	agentPromptBase?: string | null;
	materialsMd?: string | null;
	objectivesBase?: string[] | null;
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

const isEditMode = $derived("id" in template);

function jsonStr(val: unknown): string {
	if (!val || (typeof val === "object" && Object.keys(val as object).length === 0)) return "{}";
	try {
		return JSON.stringify(val, null, 2);
	} catch {
		return "{}";
	}
}

// Markdown preview
let showMdPreview = $state(false);
// untrack: explicit non-reactive init; $effect handles re-sync when prop updates (e.g. after form save)
let mdSource = $state(untrack(() => template.materialsMd ?? ""));
$effect(() => {
	mdSource = template.materialsMd ?? "";
});
let mdHtml = $derived(showMdPreview ? (marked(mdSource) as string) : "");

// Objectives: one per line
let objectivesValue = $derived((template.objectivesBase ?? []).join("\n"));

// Tags: comma-separated
let tagsValue = $derived((template.tags ?? []).join(", "));

// Variant editing state
let editingVariantId = $state<number | null>(null);
let showAddVariant = $state(false);
</script>

<form method="POST" {action} use:enhance class="space-y-8">
	{#if form?.message}
		<p class="rounded-md bg-red-50 p-3 text-sm text-red-700">{form.message}</p>
	{/if}

	<!-- Section A: Metadata -->
	<fieldset class="space-y-4">
		<legend class="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Metadata</legend>
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
			<div class="space-y-2">
				<Label for="language">Language</Label>
				<select id="language" name="language" class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" required>
					<option value="en" selected={template.language === 'en'}>English</option>
					<option value="es" selected={template.language === 'es'}>Spanish</option>
					<option value="fr" selected={template.language === 'fr'}>French</option>
					<option value="ja" selected={template.language === 'ja'}>Japanese</option>
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
				>
					<option value="chat" selected={template.interactionType === 'chat'}>Chat</option>
					<option value="oneshot" selected={template.interactionType === 'oneshot'}>Oneshot</option>
					<option value="slow" selected={template.interactionType === 'slow'}>Slow Reply</option>
					<option value="translate" selected={template.interactionType === 'translate'}>Translate</option>
				</select>
				{#if form?.errors?.interactionType}
					<p class="text-sm text-red-600">{form.errors.interactionType[0]}</p>
				{/if}
			</div>

			<div class="space-y-2">
				<Label for="ui">UI Variant</Label>
				<select id="ui" name="ui" class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" required>
					<option value="reddit" selected={template.ui === 'reddit'}>Reddit</option>
					<option value="apple_mail" selected={template.ui === 'apple_mail'}>Apple Mail</option>
					<option value="discord" selected={template.ui === 'discord'}>Discord</option>
					<option value="imessage" selected={template.ui === 'imessage'}>iMessage</option>
					<option value="ao3" selected={template.ui === 'ao3'}>AO3</option>
					<option value="translator" selected={template.ui === 'translator'}>Translator</option>
				</select>
				{#if form?.errors?.ui}
					<p class="text-sm text-red-600">{form.errors.ui[0]}</p>
				{/if}
			</div>

			<div class="space-y-2">
				<Label for="cadence">Cadence</Label>
				<select id="cadence" name="cadence" class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" required>
					<option value="weekly" selected={template.cadence === 'weekly'}>Weekly</option>
					<option value="daily" selected={template.cadence === 'daily'}>Daily</option>
				</select>
				{#if form?.errors?.cadence}
					<p class="text-sm text-red-600">{form.errors.cadence[0]}</p>
				{/if}
			</div>

			<div class="space-y-2">
				<Label for="difficulty">Difficulty (1–3)</Label>
				<Input id="difficulty" name="difficulty" type="number" min="1" max="3" value={template.difficulty ?? 1} required />
				{#if form?.errors?.difficulty}
					<p class="text-sm text-red-600">{form.errors.difficulty[0]}</p>
				{/if}
			</div>

			<div class="space-y-2">
				<Label for="maxTurns">Max Turns</Label>
				<Input id="maxTurns" name="maxTurns" type="number" min="0" value={template.maxTurns ?? ''} />
			</div>

			<div class="space-y-2">
				<Label for="estimatedWords">Estimated Words</Label>
				<Input id="estimatedWords" name="estimatedWords" type="number" min="0" value={template.estimatedWords ?? ''} />
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
		</div>
	</fieldset>

	<!-- Section B: Content -->
	<fieldset class="space-y-4">
		<legend class="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Content</legend>

		<div class="space-y-2">
			<Label for="titleBase">Title (supports &#123;&#123;slot&#125;&#125; placeholders)</Label>
			<Input id="titleBase" name="titleBase" value={template.titleBase ?? ''} required />
			{#if form?.errors?.titleBase}
				<p class="text-sm text-red-600">{form.errors.titleBase[0]}</p>
			{/if}
		</div>

		<div class="space-y-2">
			<Label for="shortObjectiveBase">Short Objective (1–2 sentences, shown on card)</Label>
			<Textarea id="shortObjectiveBase" name="shortObjectiveBase" rows={2} value={template.shortObjectiveBase ?? ''} />
		</div>

		<div class="space-y-2">
			<Label for="descriptionBase">Description</Label>
			<Textarea id="descriptionBase" name="descriptionBase" rows={3} value={template.descriptionBase ?? ''} />
		</div>

		<div class="space-y-2">
			<Label for="agentPromptBase">Agent Prompt (MBTI persona prefix injected automatically at schedule time)</Label>
			<Textarea id="agentPromptBase" name="agentPromptBase" rows={4} value={template.agentPromptBase ?? ''} />
		</div>

		<div class="space-y-2">
			<Label for="objectivesBase">Objectives (one per line)</Label>
			<Textarea
				id="objectivesBase"
				name="objectivesBase"
				rows={4}
				value={objectivesValue}
				placeholder="Give a convincing reason&#10;Do not over-explain&#10;Show you still value the friendship"
			/>
			{#if form?.errors?.objectivesBase}
				<p class="text-sm text-red-600">{form.errors.objectivesBase[0]}</p>
			{/if}
		</div>

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
					{showMdPreview ? 'Edit' : 'Preview'}
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

	<!-- Submit -->
	<div class="flex gap-3">
		<Button type="submit">{submitLabel}</Button>
		<Button href="/admin/templates" variant="outline">Cancel</Button>
	</div>
</form>

<!-- Section C: Variants (edit mode only — separate forms, outside the main form) -->
{#if isEditMode}
	<div class="mt-8 space-y-4">
		<div class="flex items-center justify-between">
			<h2 class="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Variants</h2>
			<button
				type="button"
				onclick={() => (showAddVariant = !showAddVariant)}
				class="text-sm text-primary underline underline-offset-2 hover:opacity-80"
			>
				{showAddVariant ? 'Cancel' : '+ Add Variant'}
			</button>
		</div>

		<!-- Existing variants -->
		{#each variants as v (v.id)}
			<div class="rounded-md border border-input p-4 space-y-3 {!v.isActive ? 'opacity-50' : ''}">
				<div class="flex items-center justify-between">
					<span class="text-sm font-medium">Variant #{v.id} {v.isActive ? '' : '(inactive)'}</span>
					<div class="flex gap-2">
						<button
							type="button"
							onclick={() => (editingVariantId = editingVariantId === v.id ? null : v.id)}
							class="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
						>
							{editingVariantId === v.id ? 'Close' : 'Edit'}
						</button>
						{#if v.isActive}
							<form method="POST" action="?/deactivateVariant" use:enhance>
								<input type="hidden" name="variantId" value={v.id}>
								<button type="submit" class="text-xs text-red-500 underline underline-offset-2 hover:opacity-80">Deactivate</button>
							</form>
						{/if}
					</div>
				</div>

				{#if editingVariantId === v.id}
					<form method="POST" action="?/saveVariant" use:enhance class="space-y-3">
						<input type="hidden" name="variantId" value={v.id}>
						<div class="space-y-1">
							<Label for="sv-{v.id}">Slot Values (JSON object)</Label>
							<Textarea id="sv-{v.id}" name="slotValues" rows={3} value={jsonStr(v.slotValues)} />
						</div>
						<div class="space-y-1">
							<Label for="os-{v.id}">Opening State (JSON object)</Label>
							<Textarea id="os-{v.id}" name="openingState" rows={5} value={jsonStr(v.openingState)} />
						</div>
						<Button type="submit" size="sm">Save Variant</Button>
					</form>
				{:else}
					<div class="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
						<div>
							<span class="font-medium text-foreground">Slot Values:</span>
							<pre class="mt-1 rounded bg-muted px-2 py-1 overflow-auto max-h-20">{jsonStr(v.slotValues)}</pre>
						</div>
						<div>
							<span class="font-medium text-foreground">Opening State:</span>
							<pre class="mt-1 rounded bg-muted px-2 py-1 overflow-auto max-h-20">{jsonStr(v.openingState)}</pre>
						</div>
					</div>
				{/if}
			</div>
		{/each}

		<!-- Add new variant -->
		{#if showAddVariant}
			<div class="rounded-md border border-dashed border-input p-4 space-y-3">
				<p class="text-sm font-medium">New Variant</p>
				<form method="POST" action="?/addVariant" use:enhance class="space-y-3">
					<div class="space-y-1">
						<Label for="new-sv">Slot Values (JSON object)</Label>
						<Textarea id="new-sv" name="slotValues" rows={3} value={"{}"} />
					</div>
					<div class="space-y-1">
						<Label for="new-os">Opening State (JSON object)</Label>
						<Textarea id="new-os" name="openingState" rows={5} value={"{}"} />
					</div>
					<Button type="submit" size="sm">Add Variant</Button>
				</form>
			</div>
		{/if}
	</div>
{:else}
	<!-- Create mode: first variant inline -->
	<div class="mt-8 space-y-4">
		<h2 class="text-sm font-semibold uppercase tracking-widest text-muted-foreground">First Variant</h2>
		<p class="text-xs text-muted-foreground">
			Every template requires at least one active variant. Define the slot values and opening state for the first variant here — they will be created
			together with the template in a single transaction.
		</p>
		<div class="rounded-md border border-input p-4 space-y-3">
			<div class="space-y-1">
				<Label for="firstVariantSlotValues">Slot Values (JSON object — leave <code class="rounded bg-muted px-1">{"{}"}</code> if no slots)</Label>
				<!-- This field is inside a separate form submitted with the main template create -->
			</div>
		</div>
		<p class="text-xs text-muted-foreground italic">Variant fields below are submitted as part of the template creation.</p>
		<!-- These fields are submitted via the main template form -->
		<div class="grid gap-4 sm:grid-cols-2">
			<div class="space-y-2">
				<Label for="firstVariantSlotValues">Slot Values (JSON)</Label>
				<Textarea
					id="firstVariantSlotValues"
					name="firstVariantSlotValues"
					rows={3}
					value={"{}"}
					placeholder="e.g. slot name:value pairs as JSON object"
				/>
			</div>
			<div class="space-y-2">
				<Label for="firstVariantOpeningState">Opening State (JSON)</Label>
				<Textarea
					id="firstVariantOpeningState"
					name="firstVariantOpeningState"
					rows={3}
					value={"{}"}
					placeholder="e.g. previousMessages array or source text as JSON object"
				/>
			</div>
		</div>
	</div>
{/if}
