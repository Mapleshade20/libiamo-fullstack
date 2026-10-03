<script lang="ts">
import LoaderCircle from "@lucide/svelte/icons/loader-circle";
import { untrack } from "svelte";
import { enhance } from "$app/forms";
import { base } from "$app/paths";
import { type ValidationIssue, validateBeforeSubmit } from "$lib/client/form-attention";
import Accordion from "$lib/components/common/Accordion.svelte";
import Select from "$lib/components/common/Select.svelte";
import Switch from "$lib/components/common/Switch.svelte";
import EffortSelect from "$lib/components/llm/EffortSelect.svelte";
import { formatLabTime, formatLatency } from "$lib/components/llm/format";
import MessagesView from "$lib/components/llm/MessagesView.svelte";
import OutputView from "$lib/components/llm/OutputView.svelte";
import SlotEditor from "$lib/components/llm/SlotEditor.svelte";
import { Badge } from "$lib/components/ui/badge";
import { Button } from "$lib/components/ui/button";
import { Input } from "$lib/components/ui/input";
import { Textarea } from "$lib/components/ui/textarea";
import type { ReasoningEffort } from "$lib/constants";
import { type LabChatMessage, temperaturePlaceholder } from "$lib/llm/lab";
import { unknownTemplateVariables } from "$lib/llm/template";
import { getDisplayClock } from "$lib/time/display-clock";

let { data, form } = $props();
const clock = getDisplayClock();
const recipeTitles = $derived(new Map(data.recipes.map((candidate) => [candidate.id, candidate.title])));

function defaultSlots(recipeId: string, overrides: Record<string, string> = {}): Record<string, string> {
	const recipe = data.recipes.find((candidate) => candidate.id === recipeId);
	return Object.fromEntries((recipe?.slots ?? []).map((slot) => [slot.name, overrides[slot.name] ?? slot.template]));
}

// Seeded once from the server-known source; later edits are local.
let recipeId = $state(untrack(() => data.initialRecipeId));
let inputText = $state(untrack(() => JSON.stringify(data.source?.input ?? {}, null, 2)));
let slots = $state(untrack(() => defaultSlots(data.initialRecipeId, data.source?.slots)));
let providerRef = $state(untrack(() => data.providers[0]?.ref ?? "default"));
let temperature = $state(
	untrack(() => (data.source?.temperature === null || data.source?.temperature === undefined ? "" : String(data.source.temperature))),
);
let reasoningEffort = $state<ReasoningEffort | "">(untrack(() => data.source?.reasoningEffort ?? ""));
let editMessages = $state(untrack(() => Boolean(data.source?.messages)));
let messages = $state<LabChatMessage[]>(untrack(() => data.source?.messages ?? []));
let pending = $state<"preview" | "run" | null>(null);

const recipe = $derived(data.recipes.find((candidate) => candidate.id === recipeId) ?? data.recipes[0]);
const showSource = $derived(Boolean(data.source?.trace && data.source.recipeId === recipeId));

function changeRecipe(next: string) {
	recipeId = next;
	slots = defaultSlots(next);
	if (next !== data.source?.recipeId) inputText = "{}";
	editMessages = false;
	messages = [];
}

const payload = $derived(
	JSON.stringify({
		recipeId,
		input: inputText,
		slots,
		providerRef,
		temperature: temperature.trim() === "" ? null : Number(temperature),
		reasoningEffort: reasoningEffort || null,
		messages: editMessages && messages.length ? messages : null,
	}),
);

function validate(): ValidationIssue[] {
	const issues: ValidationIssue[] = [];
	try {
		JSON.parse(inputText);
	} catch {
		issues.push({ path: ["input"], message: "The input must be valid JSON." });
	}
	for (const slot of recipe.slots) {
		const unknown = unknownTemplateVariables(slots[slot.name] ?? "", slot.variables);
		if (unknown.length) issues.push({ path: [`slot.${slot.name}`], message: `Unknown variables: ${unknown.join(", ")}` });
	}
	const value = Number(temperature);
	if (temperature.trim() !== "" && (!Number.isFinite(value) || value < 0 || value > 2))
		issues.push({ path: ["temperature"], message: "Use a temperature from 0 to 2." });
	return issues;
}

$effect(() => {
	// A fresh preview seeds the message editor when it is empty.
	if (form?.preview && editMessages && messages.length === 0) messages = form.preview.map((message) => ({ ...message }));
});
</script>

<svelte:head> <title>Playground · LLM Lab · Libiamo</title> </svelte:head>

<div class="space-y-6">
	<div class="space-y-1">
		<h1>Playground</h1>
		<p class="text-sm text-muted-foreground">
			Re-run one input with other slots, providers or hand-edited messages. Runs are stored as Lab traces and never change learner data or quota.
			{#if data.source}
				<span class="block">Loaded from {data.source.label}.</span>
			{/if}
		</p>
	</div>

	{#if !data.source && !form}
		<section
			aria-labelledby="start-heading"
			class="grid gap-6 rounded-xl border border-border bg-card p-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]"
		>
			<div class="space-y-3">
				<h2 id="start-heading">Start from a real call</h2>
				<ol class="list-decimal space-y-2 pl-5 text-sm leading-relaxed">
					<li>
						Pick a call on the right, or <a class="underline underline-offset-2" href="{base}/admin/lab/traces">find one in Traces</a> and choose
						<em>Open in Playground</em>. Its input, slots and settings load here, next to its original output.
					</li>
					<li>Change one thing: a slot's wording, the provider, the effort or the temperature.</li>
					<li>
						<em>Preview messages</em>
						shows the prompt without calling a model; <em>Run</em> calls it and puts the result above the original. Every run is kept as a Lab trace.
					</li>
				</ol>
				<p class="text-sm text-muted-foreground">
					Dataset cases open here too, from <a class="underline underline-offset-2" href="{base}/admin/lab/datasets">Datasets</a>. To start from
					nothing, pick a recipe below and write its input JSON.
				</p>
			</div>
			<div class="space-y-2">
				<h3 class="text-sm font-medium">Recent real calls</h3>
				{#if data.recentCalls.length}
					<ul class="-mx-2 divide-y divide-border">
						{#each data.recentCalls as call (call.id)}
							<li>
								<a
									href="{base}/admin/lab/playground?trace={call.id}"
									class="flex min-h-11 flex-wrap items-baseline gap-x-3 rounded-md px-2 py-2 text-sm transition-colors duration-100 hover:bg-foreground/[0.03] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
								>
									<span class="font-medium">{recipeTitles.get(call.recipeId) ?? call.recipeId}</span>
									{#if call.status === "error"}
										<Badge variant="destructive">Error</Badge>
									{/if}
									<span class="ml-auto text-xs text-muted-foreground tabular-nums">
										{call.userName ?? "—"}{call.taskId ? ` · task #${call.taskId}` : ""}
										· {formatLabTime(call.createdAt, clock().timeZone)}
									</span>
								</a>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="text-sm text-muted-foreground">
						No real calls captured yet. Use the app (as an admin, your own calls are always captured) and come back.
					</p>
				{/if}
			</div>
		</section>
	{/if}

	<form
		method="POST"
		action="?/run"
		class="grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
		use:enhance={({ submitter }) => {
			pending = submitter?.getAttribute("formaction")?.includes("preview") ? "preview" : "run";
			return async ({ update }) => {
				try {
					await update({ reset: false });
				} finally {
					pending = null;
				}
			};
		}}
	>
		<input type="hidden" name="payload" value={payload}>
		<div class="space-y-5" use:validateBeforeSubmit={validate}>
			<div class="flex flex-col gap-1.5">
				<label for="playground-recipe" class="text-sm font-medium">Recipe</label>
				<Select
					id="playground-recipe"
					value={recipeId}
					onValueChange={changeRecipe}
					items={data.recipes.map((option) => ({ value: option.id, label: option.title }))}
				/>
			</div>
			<div class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_11rem_10rem]">
				<div class="flex min-w-0 flex-col gap-1.5">
					<label for="playground-provider" class="text-sm font-medium">Provider</label>
					<Select
						id="playground-provider"
						bind:value={providerRef}
						items={data.providers.map((provider) => ({ value: provider.ref, label: `${provider.label} · ${provider.model}` }))}
					/>
				</div>
				<EffortSelect bind:value={reasoningEffort} recipeDefault={recipe.reasoningEffort} />
				<div class="flex flex-col gap-1.5">
					<label for="playground-temperature" class="text-sm font-medium">Temperature</label>
					<Input
						id="playground-temperature"
						name="temperature"
						inputmode="decimal"
						placeholder={temperaturePlaceholder(recipe)}
						bind:value={temperature}
					/>
				</div>
			</div>

			<div class="flex flex-col gap-1.5">
				<label for="playground-input" class="text-sm font-medium">Input (JSON)</label>
				<Textarea
					id="playground-input"
					name="input"
					bind:value={inputText}
					rows={14}
					spellcheck="false"
					class="field-sizing-fixed font-mono text-xs leading-relaxed"
				/>
			</div>

			{#if recipe.slots.length}
				<div class="space-y-2">
					<h3 class="text-sm font-medium">Slots</h3>
					<div class="divide-y divide-border rounded-xl border border-border bg-card px-4">
						{#each recipe.slots as slot (slot.name)}
							<Accordion title={`${slot.label}${slots[slot.name] !== slot.template ? " · edited" : ""}`} variant="plain">
								<SlotEditor definition={slot} bind:value={slots[slot.name]} feedbackName={`slot.${slot.name}`} />
							</Accordion>
						{/each}
					</div>
				</div>
			{:else}
				<p class="text-sm text-muted-foreground">This recipe has no slots; edit the messages directly to change its prompt.</p>
			{/if}

			<div class="space-y-3 border-t border-border pt-4">
				<label class="flex min-h-11 cursor-pointer items-center justify-between gap-4 text-sm">
					Send hand-edited messages instead of the recipe's (one-off)
					<Switch bind:checked={editMessages} />
				</label>
				{#if editMessages}
					{#if messages.length === 0}
						<p class="text-sm text-muted-foreground">Preview the messages first; they will appear here for editing.</p>
					{/if}
					{#each messages as message, index}
						<div class="flex flex-col gap-1.5">
							<label for="playground-message-{index}" class="text-sm font-medium capitalize">{message.role}</label>
							<Textarea
								id="playground-message-{index}"
								bind:value={messages[index].content}
								rows={8}
								spellcheck="false"
								class="field-sizing-fixed font-mono text-xs"
							/>
						</div>
					{/each}
					{#if messages.length}
						<Button variant="ghost" onclick={() => (messages = [])}>Discard edits</Button>
					{/if}
				{/if}
			</div>

			<div class="flex flex-wrap gap-2">
				<Button type="submit" disabled={pending !== null}>
					{#if pending === "run"}
						<LoaderCircle class="animate-spin motion-reduce:animate-none" aria-hidden="true" />
					{/if}
					Run
				</Button>
				<Button type="submit" formaction="?/preview" variant="secondary" disabled={pending !== null}>
					{#if pending === "preview"}
						<LoaderCircle class="animate-spin motion-reduce:animate-none" aria-hidden="true" />
					{/if}
					Preview messages
				</Button>
			</div>
			{#if form?.error}
				<p class="field-error-message" role="alert">{form.error}</p>
			{/if}
		</div>

		<div class="space-y-6" aria-live="polite">
			{#if form?.result}
				<section class="space-y-3">
					<div class="flex flex-wrap items-baseline justify-between gap-2">
						<h2>Result</h2>
						<p class="text-xs text-muted-foreground">
							{form.result.route?.model ?? ""}
							· {formatLatency(form.result.latencyMs)} · {form.result.completionTokens ?? "—"} tokens ·
							<a class="underline underline-offset-2" href="{base}/admin/lab/traces/{form.result.id}">trace</a>
						</p>
					</div>
					<OutputView recipeId={form.result.recipeId} output={form.result.output} outputText={form.result.outputText} error={form.result.error} />
				</section>
			{/if}
			{#if showSource && data.source?.trace}
				<section class="space-y-3">
					<h2>Source output</h2>
					<p class="text-xs text-muted-foreground">{data.source.trace.route?.model ?? ""}</p>
					<OutputView {recipeId} output={data.source.trace.output} outputText={data.source.trace.outputText} error={data.source.trace.error} />
				</section>
			{/if}
			{#if form?.result}
				<section class="space-y-3">
					<h2>Sent messages</h2>
					<MessagesView messages={form.result.messages} />
				</section>
			{:else if form?.preview}
				<section class="space-y-3">
					<h2>Preview</h2>
					<MessagesView messages={form.preview} />
				</section>
			{:else if !showSource}
				<p class="text-sm text-muted-foreground">Preview the messages or run the recipe to see its output here.</p>
			{/if}
		</div>
	</form>
</div>
