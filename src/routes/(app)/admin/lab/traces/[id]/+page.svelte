<script lang="ts">
import { enhance } from "$app/forms";
import { base } from "$app/paths";
import Accordion from "$lib/components/common/Accordion.svelte";
import ConfirmDialog from "$lib/components/common/ConfirmDialog.svelte";
import { formatLabTime, formatLatency, ORIGIN_LABELS } from "$lib/components/llm/format";
import MessagesView from "$lib/components/llm/MessagesView.svelte";
import OutputView from "$lib/components/llm/OutputView.svelte";
import ValueView from "$lib/components/llm/ValueView.svelte";
import { getDisplayClock } from "$lib/time/display-clock";

let { data, form } = $props();
const clock = getDisplayClock();
const trace = $derived(data.trace);
let confirmDelete = $state(false);
let deleting = $state(false);
let deleteForm: HTMLFormElement | null = $state(null);

const fieldClass =
	"w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const buttonClass =
	"inline-flex min-h-11 items-center rounded-md border border-border px-4 text-sm hover:bg-secondary focus-visible:outline-2 focus-visible:outline-ring";
</script>

<svelte:head> <title>{data.recipe?.title ?? trace.recipeId} · LLM Lab · Libiamo</title> </svelte:head>

<div class="space-y-8">
	<header class="space-y-2">
		<a href="{base}/admin/lab/traces" class="inline-flex min-h-11 items-center text-sm text-muted-foreground hover:text-foreground">← Traces</a>
		<h1 class="text-3xl">{data.recipe?.title ?? trace.recipeId}</h1>
		<dl class="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
			<div>
				<dt class="inline">When</dt>
				<dd class="inline text-foreground tabular-nums">{formatLabTime(trace.createdAt, clock().timeZone)}</dd>
			</div>
			<div>
				<dt class="inline">Origin</dt>
				<dd class="inline text-foreground">{ORIGIN_LABELS[trace.origin]}{trace.variant?.label ? ` · ${trace.variant.label}` : ""}</dd>
			</div>
			{#if trace.userId}
				<div>
					<dt class="inline">User</dt>
					<dd class="inline text-foreground">{trace.userName ?? trace.userId} <span class="text-muted-foreground">{trace.userEmail}</span></dd>
				</div>
			{/if}
			{#if trace.taskId}
				<div>
					<dt class="inline">Task</dt>
					<dd class="inline text-foreground">#{trace.taskId}</dd>
				</div>
			{/if}
			{#if trace.sessionId}
				<div>
					<dt class="inline">Session</dt>
					<dd class="inline text-foreground">#{trace.sessionId}</dd>
				</div>
			{/if}
			{#if trace.translationAttemptId}
				<div>
					<dt class="inline">Attempt</dt>
					<dd class="inline text-foreground">#{trace.translationAttemptId}</dd>
				</div>
			{/if}
			<div>
				<dt class="inline">Model</dt>
				<dd class="inline text-foreground">
					{trace.route?.model ?? "—"}
					<span class="text-muted-foreground"
						>{trace.route ? `(${trace.route.source}${trace.route.providerId ? `: ${trace.route.providerId}` : ""}, ${trace.route.host})` : ""}</span
					>
				</dd>
			</div>
			<div>
				<dt class="inline">Latency</dt>
				<dd class="inline text-foreground tabular-nums">{formatLatency(trace.latencyMs)}</dd>
			</div>
			<div>
				<dt class="inline">Tokens</dt>
				<dd class="inline text-foreground tabular-nums">{trace.promptTokens ?? "—"} in · {trace.completionTokens ?? "—"} out</dd>
			</div>
			<div>
				<dt class="inline">Recipe</dt>
				<dd class="inline text-foreground">
					{trace.recipeId}
					v{trace.recipeVersion}{data.recipe && data.recipe.version !== trace.recipeVersion ? ` (current v${data.recipe.version})` : ""}
				</dd>
			</div>
		</dl>
		{#if trace.variant && (trace.variant.slots || trace.variant.options || trace.variant.messagesEdited)}
			<p class="text-sm text-[#8a5a1f]">
				Deviates from the defaults:
				{[trace.variant.slots ? `slots ${Object.keys(trace.variant.slots).join(", ")}` : null, trace.variant.options ? `options ${JSON.stringify(trace.variant.options)}` : null, trace.variant.messagesEdited ? "hand-edited messages" : null].filter(Boolean).join(" · ")}
			</p>
		{/if}
		<div class="flex flex-wrap items-center gap-2 pt-2">
			<a href="{base}/admin/lab/playground?trace={trace.id}" class={buttonClass}>Open in Playground</a>
			{#if trace.runId === null}
				<button type="button" class="{buttonClass} text-destructive" onclick={() => (confirmDelete = true)}>Delete trace</button>
			{:else}
				<a
					href="{base}/admin/lab/runs/{trace.runId}"
					class="inline-flex min-h-11 items-center px-2 text-sm text-muted-foreground underline underline-offset-2"
					>Part of run #{trace.runId}; delete the run to remove it</a
				>
			{/if}
		</div>
		{#if form?.deleteError}
			<p class="text-sm text-destructive" role="alert">{form.deleteError}</p>
		{/if}
		<form
			bind:this={deleteForm}
			method="POST"
			action="?/delete"
			hidden
			use:enhance={() => {
				deleting = true;
				return async ({ update }) => {
					try {
						await update();
					} finally {
						deleting = false;
						confirmDelete = false;
					}
				};
			}}
		></form>
		<ConfirmDialog
			bind:open={confirmDelete}
			busy={deleting}
			title="Delete this trace?"
			message="Its ratings are deleted with it. Dataset cases pinned from it keep their input. This cannot be undone."
			confirmLabel="Delete"
			cancelLabel="Cancel"
			onconfirm={() => deleteForm?.requestSubmit()}
		/>
	</header>

	<section aria-labelledby="output-heading" class="space-y-3">
		<h2 id="output-heading" class="font-serif text-2xl">Output</h2>
		<OutputView recipeId={trace.recipeId} output={trace.output} outputText={trace.outputText} error={trace.error} />
	</section>

	<div class="grid gap-6 lg:grid-cols-2">
		<section aria-labelledby="rate-heading" class="space-y-3 rounded-lg border border-border p-4">
			<h2 id="rate-heading" class="font-serif text-xl">Rate</h2>
			<form method="POST" action="?/rate" use:enhance={() => async ({ update }) => update({ reset: false })} class="space-y-3">
				<fieldset class="flex flex-wrap gap-2">
					<legend class="sr-only">Vote</legend>
					{#each [{ value: 1, label: "👍 Good" }, { value: -1, label: "👎 Bad" }, { value: 0, label: "Note only" }] as option}
						<label
							class="inline-flex min-h-11 cursor-pointer items-center rounded-md border border-border px-3 text-sm has-[:checked]:border-foreground/40 has-[:checked]:bg-secondary has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
						>
							<input class="sr-only" type="radio" name="vote" value={option.value} checked={(data.myRating?.vote ?? 0) === option.value}>
							{option.label}
						</label>
					{/each}
				</fieldset>
				<textarea name="note" rows="3" maxlength="2000" class={fieldClass} placeholder="What is good or wrong here?" aria-label="Note">
					{data.myRating?.note ?? ""}
				</textarea>
				<button type="submit" class={buttonClass}>Save rating</button>
				{#if form?.rateError}
					<p class="text-sm text-destructive" role="alert">{form.rateError}</p>
				{/if}
				{#if form?.rated}
					<p class="text-sm text-muted-foreground" role="status">Saved.</p>
				{/if}
			</form>
			{#if trace.ratings.length}
				<ul class="space-y-2 border-t border-border pt-3 text-sm">
					{#each trace.ratings as rating}
						<li>
							<span class="font-medium">{rating.userName}</span> {rating.vote > 0 ? "👍" : rating.vote < 0 ? "👎" : ""}
							<span class="text-muted-foreground">{rating.note}</span>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<section aria-labelledby="pin-heading" class="space-y-3 rounded-lg border border-border p-4">
			<h2 id="pin-heading" class="font-serif text-xl">Pin to a dataset</h2>
			<p class="text-sm text-muted-foreground">Copies this call's input into a dataset of {trace.recipeId} cases, kept until removed.</p>
			<form method="POST" action="?/pin" use:enhance class="space-y-3">
				{#if data.datasets.length}
					<label class="grid gap-1 text-sm">
						Dataset
						<select name="datasetId" class="{fieldClass} h-11">
							{#each data.datasets as dataset}
								<option value={dataset.id}>{dataset.name}</option>
							{/each}
						</select>
					</label>
				{/if}
				<label class="grid gap-1 text-sm">
					{data.datasets.length ? "Or create a new dataset" : "New dataset name"}
					<input name="newDatasetName" class="{fieldClass} h-11" placeholder="e.g. notes-task-leakage" required={data.datasets.length === 0}>
				</label>
				<label class="grid gap-1 text-sm">
					Case label
					<input name="label" class="{fieldClass} h-11" placeholder="What makes this case interesting">
				</label>
				<button type="submit" class={buttonClass}>Pin case</button>
				{#if form?.pinError}
					<p class="text-sm text-destructive" role="alert">{form.pinError}</p>
				{/if}
				{#if form?.pinnedTo}
					<p class="text-sm" role="status">
						Pinned. <a class="underline underline-offset-2" href="{base}/admin/lab/datasets/{form.pinnedTo}">Open dataset</a>
					</p>
				{/if}
			</form>
		</section>
	</div>

	<section aria-labelledby="request-heading" class="space-y-3">
		<h2 id="request-heading" class="font-serif text-2xl">Request</h2>
		<MessagesView messages={trace.messages} />
		{#if Object.keys(trace.options).length}
			<p class="text-sm text-muted-foreground">Options: <code>{JSON.stringify(trace.options)}</code></p>
		{/if}
	</section>

	{#if trace.attempts.length > 1 || trace.attempts.some((attempt) => attempt.errors.length)}
		<section aria-labelledby="attempts-heading" class="space-y-3">
			<h2 id="attempts-heading" class="font-serif text-2xl">Attempts</h2>
			{#each trace.attempts as attempt}
				<Accordion
					title={`${attempt.stage === "repair" ? "Repair" : "Initial"} response${attempt.errors.length ? ` · ${attempt.errors.length} error(s)` : ""}`}
				>
					{#if attempt.errors.length}
						<ul class="mb-2 list-disc pl-5 text-sm text-destructive">
							{#each attempt.errors as message}
								<li>{message}</li>
							{/each}
						</ul>
					{/if}
					<pre class="max-h-96 overflow-auto whitespace-pre-wrap break-words font-mono text-xs">{attempt.content ?? "(no content)"}</pre>
				</Accordion>
			{/each}
		</section>
	{/if}

	<section aria-labelledby="input-heading" class="space-y-3">
		<h2 id="input-heading" class="font-serif text-2xl">Recipe input</h2>
		<Accordion title="Structured input the recipe built its messages from">
			<div class="text-sm"><ValueView value={trace.input} /></div>
		</Accordion>
	</section>
</div>
