<script lang="ts">
import ArrowLeft from "@lucide/svelte/icons/arrow-left";
import { enhance } from "$app/forms";
import { base } from "$app/paths";
import Accordion from "$lib/components/common/Accordion.svelte";
import ConfirmDialog from "$lib/components/common/ConfirmDialog.svelte";
import SegmentedControl from "$lib/components/common/SegmentedControl.svelte";
import Select from "$lib/components/common/Select.svelte";
import { formatLabTime, formatLatency, ORIGIN_LABELS } from "$lib/components/llm/format";
import MessagesView from "$lib/components/llm/MessagesView.svelte";
import OutputView from "$lib/components/llm/OutputView.svelte";
import ValueView from "$lib/components/llm/ValueView.svelte";
import { Badge } from "$lib/components/ui/badge";
import { Button } from "$lib/components/ui/button";
import { Input } from "$lib/components/ui/input";
import { Textarea } from "$lib/components/ui/textarea";
import { getDisplayClock } from "$lib/time/display-clock";

let { data, form } = $props();
const clock = getDisplayClock();
const trace = $derived(data.trace);
let confirmDelete = $state(false);
let deleting = $state(false);
let deleteForm: HTMLFormElement | null = $state(null);
</script>

<svelte:head> <title>{data.recipe?.title ?? trace.recipeId} · LLM Lab · Libiamo</title> </svelte:head>

<div class="space-y-8">
	<header class="space-y-2">
		<Button href="{base}/admin/lab/traces" variant="ghost" size="sm" class="-ml-3"><ArrowLeft aria-hidden="true" />Traces</Button>
		<h1>{data.recipe?.title ?? trace.recipeId}</h1>
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
			<p class="text-sm text-warning">
				Deviates from the defaults:
				{[trace.variant.slots ? `slots ${Object.keys(trace.variant.slots).join(", ")}` : null, trace.variant.options ? `options ${JSON.stringify(trace.variant.options)}` : null, trace.variant.messagesEdited ? "hand-edited messages" : null].filter(Boolean).join(" · ")}
			</p>
		{/if}
		<div class="flex flex-wrap items-center gap-2 pt-2">
			<Button href="{base}/admin/lab/playground?trace={trace.id}" variant="secondary">Open in Playground</Button>
			{#if trace.runId === null}
				<Button variant="destructive" aria-haspopup="dialog" onclick={() => (confirmDelete = true)}>Delete trace</Button>
			{:else}
				<Button href="{base}/admin/lab/runs/{trace.runId}" variant="link" class="ml-2 text-muted-foreground"
					>Part of run #{trace.runId}; delete the run to remove it</Button
				>
			{/if}
		</div>
		{#if form?.deleteError}
			<p class="field-error-message" role="alert">{form.deleteError}</p>
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
		<h2 id="output-heading">Output</h2>
		<OutputView recipeId={trace.recipeId} output={trace.output} outputText={trace.outputText} error={trace.error} />
	</section>

	<div class="grid gap-6 lg:grid-cols-2">
		<section aria-labelledby="rate-heading" class="space-y-4 rounded-xl border border-border bg-card p-5">
			<h2 id="rate-heading">Rate</h2>
			<form method="POST" action="?/rate" use:enhance={() => async ({ update }) => update({ reset: false })} class="space-y-3">
				<SegmentedControl
					label="Vote"
					name="vote"
					value={String(data.myRating?.vote ?? 0)}
					items={[
						{ value: "1", label: "Good" },
						{ value: "-1", label: "Bad" },
						{ value: "0", label: "Note only" },
					]}
				/>
				<Textarea
					name="note"
					rows={3}
					maxlength={2000}
					value={data.myRating?.note ?? ""}
					placeholder="What is good or wrong here?"
					aria-label="Note"
				/>
				<Button type="submit" variant="secondary">Save rating</Button>
				{#if form?.rateError}
					<p class="field-error-message" role="alert">{form.rateError}</p>
				{/if}
				{#if form?.rated}
					<p class="text-sm text-muted-foreground" role="status">Saved.</p>
				{/if}
			</form>
			{#if trace.ratings.length}
				<ul class="space-y-2 border-t border-border pt-3 text-sm">
					{#each trace.ratings as rating}
						<li>
							<span class="font-medium">{rating.userName}</span>
							{#if rating.vote !== 0}
								<Badge variant={rating.vote > 0 ? "success" : "destructive"}>{rating.vote > 0 ? "Good" : "Bad"}</Badge>
							{/if}
							<span class="text-muted-foreground">{rating.note}</span>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<section aria-labelledby="pin-heading" class="space-y-4 rounded-xl border border-border bg-card p-5">
			<h2 id="pin-heading">Pin to a dataset</h2>
			<p class="text-sm text-muted-foreground">Copies this call's input into a dataset of {trace.recipeId} cases, kept until removed.</p>
			<form method="POST" action="?/pin" use:enhance class="space-y-3">
				{#if data.datasets.length}
					<div class="flex flex-col gap-1.5">
						<label for="pin-dataset" class="text-sm font-medium">Dataset</label>
						<Select
							id="pin-dataset"
							name="datasetId"
							value={String(data.datasets[0].id)}
							items={data.datasets.map((dataset) => ({ value: String(dataset.id), label: dataset.name }))}
						/>
					</div>
				{/if}
				<div class="flex flex-col gap-1.5">
					<label for="pin-new-dataset" class="text-sm font-medium">{data.datasets.length ? "Or create a new dataset" : "New dataset name"}</label>
					<Input id="pin-new-dataset" name="newDatasetName" placeholder="e.g. notes-task-leakage" required={data.datasets.length === 0} />
				</div>
				<div class="flex flex-col gap-1.5">
					<label for="pin-label" class="text-sm font-medium">Case label</label>
					<Input id="pin-label" name="label" placeholder="What makes this case interesting" />
				</div>
				<Button type="submit" variant="secondary">Pin case</Button>
				{#if form?.pinError}
					<p class="field-error-message" role="alert">{form.pinError}</p>
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
		<h2 id="request-heading">Request</h2>
		<MessagesView messages={trace.messages} />
		{#if Object.keys(trace.options).length}
			<p class="text-sm text-muted-foreground">Options: <code>{JSON.stringify(trace.options)}</code></p>
		{/if}
	</section>

	{#if trace.attempts.length > 1 || trace.attempts.some((attempt) => attempt.errors.length)}
		<section aria-labelledby="attempts-heading" class="space-y-3">
			<h2 id="attempts-heading">Attempts</h2>
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
		<h2 id="input-heading">Recipe input</h2>
		<Accordion title="Structured input the recipe built its messages from">
			<div class="text-sm"><ValueView value={trace.input} /></div>
		</Accordion>
	</section>
</div>
