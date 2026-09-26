<script lang="ts">
import { enhance } from "$app/forms";
import { base } from "$app/paths";
import Accordion from "$lib/components/common/Accordion.svelte";
import ConfirmDialog from "$lib/components/common/ConfirmDialog.svelte";
import FormErrorFocus from "$lib/components/common/FormErrorFocus.svelte";
import { formatLabTime } from "$lib/components/llm/format";
import ValueView from "$lib/components/llm/ValueView.svelte";
import { getDisplayClock } from "$lib/time/display-clock";
import RunBuilder from "./RunBuilder.svelte";

let { data, form } = $props();
const clock = getDisplayClock();
const dataset = $derived(data.dataset);
let addCaseForm: HTMLFormElement | null = $state(null);
let deleteForm: HTMLFormElement | null = $state(null);
let confirmDelete = $state(false);

const fieldClass =
	"w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-invalid:border-destructive";
const buttonClass =
	"inline-flex min-h-11 items-center rounded-md border border-border px-4 text-sm hover:bg-secondary focus-visible:outline-2 focus-visible:outline-ring";
const keepValues =
	() =>
	async ({ update }: { update: (options?: { reset?: boolean }) => Promise<void> }) =>
		update({ reset: false });
</script>

<svelte:head> <title>{dataset.name} · LLM Lab · Libiamo</title> </svelte:head>

<div class="space-y-8">
	<header class="space-y-2">
		<a href="{base}/admin/lab/datasets" class="inline-flex min-h-11 items-center text-sm text-muted-foreground hover:text-foreground">← Datasets</a>
		<h1 class="text-3xl">{dataset.name}</h1>
		<p class="text-sm text-muted-foreground">{data.recipe?.title ?? dataset.recipeId}{dataset.description ? ` · ${dataset.description}` : ""}</p>
		<Accordion title="Edit dataset" class="max-w-2xl">
			<FormErrorFocus errors={form?.errors} fieldOrder={["name"]} />
			<form method="POST" action="?/update" use:enhance={keepValues} class="space-y-3">
				<label class="grid gap-1 text-sm">
					Name
					<input name="name" value={dataset.name} required maxlength="120" class="{fieldClass} h-11" aria-invalid={Boolean(form?.errors?.name)}>
					{#if form?.errors?.name}
						<span data-field-error="name" class="text-sm text-destructive">{form.errors.name[0]}</span>
					{/if}
				</label>
				<label class="grid gap-1 text-sm">
					Question it answers
					<input name="description" value={dataset.description} class="{fieldClass} h-11">
				</label>
				<label class="grid gap-1 text-sm">
					Judge rubric
					<textarea name="judgeRubric" rows="4" class="{fieldClass} py-2">{dataset.judgeRubric ?? ""}</textarea>
				</label>
				<div class="flex flex-wrap gap-2">
					<button type="submit" class={buttonClass}>Save</button>
					<button type="button" class="{buttonClass} text-destructive" onclick={() => (confirmDelete = true)}>Delete dataset</button>
				</div>
				{#if form?.updated}
					<p class="text-sm text-muted-foreground" role="status">Saved.</p>
				{/if}
			</form>
		</Accordion>
		<form bind:this={deleteForm} method="POST" action="?/delete" hidden></form>
		<ConfirmDialog
			bind:open={confirmDelete}
			title="Delete this dataset?"
			message="Its cases, runs and run outputs are deleted. Real-flow traces are not affected."
			confirmLabel="Delete"
			cancelLabel="Cancel"
			onconfirm={() => deleteForm?.requestSubmit()}
		/>
	</header>

	<section aria-labelledby="cases-heading" class="space-y-3">
		<h2 id="cases-heading" class="font-serif text-2xl">
			Cases <span class="text-base text-muted-foreground tabular-nums">({dataset.cases.length})</span>
		</h2>
		{#if dataset.cases.length === 0}
			<p class="text-sm text-muted-foreground">No cases. Pin traces from the trace pages, or add a JSON input below.</p>
		{/if}
		<ul class="space-y-2">
			{#each dataset.cases as item (item.id)}
				<li class="rounded-lg border border-border p-3">
					<div class="flex flex-wrap items-center gap-2">
						<form method="POST" action="?/updateCase" use:enhance={keepValues} class="flex min-w-0 flex-1 items-center gap-2">
							<input type="hidden" name="caseId" value={item.id}>
							<span class="shrink-0 text-xs text-muted-foreground tabular-nums">#{item.id}</span>
							<input
								name="label"
								value={item.label}
								placeholder="Label"
								aria-label={`Label of case ${item.id}`}
								class="{fieldClass} h-11 min-w-0 flex-1"
								onchange={(event) => event.currentTarget.form?.requestSubmit()}
							>
						</form>
						<a href="{base}/admin/lab/playground?case={item.id}" class={buttonClass}>Playground</a>
						{#if item.sourceTraceId}
							<a href="{base}/admin/lab/traces/{item.sourceTraceId}" class={buttonClass}>Source trace</a>
						{/if}
						<form method="POST" action="?/deleteCase" use:enhance>
							<input type="hidden" name="caseId" value={item.id}>
							<button type="submit" class={buttonClass} aria-label={`Remove case ${item.id}`}>Remove</button>
						</form>
					</div>
					<p class="mt-1 text-xs text-muted-foreground">
						Added {formatLabTime(item.createdAt, clock().timeZone)} · recipe v{item.recipeVersion}
						{data.recipe && data.recipe.version !== item.recipeVersion ? ` (current v${data.recipe.version}; input may no longer fit)` : ""}
						{#if item.sourceTraceId === null && item.sourceUserId === null && item.createdBy}
							· hand-written
						{/if}
					</p>
					<Accordion title="Input" class="mt-2">
						<div class="text-sm"><ValueView value={item.input} /></div>
					</Accordion>
				</li>
			{/each}
		</ul>
		<Accordion title="Add a case from JSON" class="max-w-3xl">
			<FormErrorFocus formRef={addCaseForm} errors={form?.errors} fieldOrder={["input"]} />
			<form bind:this={addCaseForm} method="POST" action="?/addCase" use:enhance class="space-y-3">
				<label class="grid gap-1 text-sm">
					Label
					<input name="label" class="{fieldClass} h-11">
				</label>
				<label class="grid gap-1 text-sm">
					Recipe input (JSON)
					<textarea
						name="input"
						rows="10"
						required
						spellcheck="false"
						class="{fieldClass} py-2 font-mono text-xs"
						aria-invalid={Boolean(form?.errors?.input)}
					>
						{"{}"}
					</textarea>
					{#if form?.errors?.input}
						<span data-field-error="input" class="text-sm text-destructive">{form.errors.input[0]}</span>
					{/if}
				</label>
				<button type="submit" class={buttonClass}>Add case</button>
			</form>
		</Accordion>
	</section>

	<section aria-labelledby="runs-heading" class="space-y-3">
		<h2 id="runs-heading" class="font-serif text-2xl">Runs</h2>
		{#if dataset.runs.length}
			<ul class="space-y-1">
				{#each dataset.runs as run (run.id)}
					<li>
						<a href="{base}/admin/lab/runs/{run.id}" class="inline-flex min-h-11 items-center gap-2 hover:underline">
							<span class="font-medium">{run.label || `Run ${run.id}`}</span>
							<span class="text-xs text-muted-foreground"
								>{run.variants.map((variant) => variant.label).join(" vs ")}
								· {formatLabTime(run.createdAt, clock().timeZone)}</span
							>
						</a>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="text-sm text-muted-foreground">No runs yet.</p>
		{/if}
	</section>

	{#if data.recipe}
		<section aria-labelledby="new-run-heading" class="space-y-3">
			<h2 id="new-run-heading" class="font-serif text-2xl">New run</h2>
			<p class="text-sm text-muted-foreground">
				Every case runs once per column and repeat. Slot edits apply to all cases; the defaults are today's prompt.
			</p>
			<RunBuilder
				recipe={data.recipe}
				providers={data.providers}
				defaultRubric={dataset.judgeRubric ?? ""}
				caseCount={dataset.cases.length}
				error={form?.runError ?? null}
			/>
		</section>
	{/if}
</div>
