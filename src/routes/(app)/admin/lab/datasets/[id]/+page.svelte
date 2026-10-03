<script lang="ts">
import ArrowLeft from "@lucide/svelte/icons/arrow-left";
import { enhance } from "$app/forms";
import { base } from "$app/paths";
import Accordion from "$lib/components/common/Accordion.svelte";
import ConfirmDialog from "$lib/components/common/ConfirmDialog.svelte";
import Field from "$lib/components/common/Field.svelte";
import FormErrorFocus from "$lib/components/common/FormErrorFocus.svelte";
import { formatLabTime } from "$lib/components/llm/format";
import ValueView from "$lib/components/llm/ValueView.svelte";
import { Button } from "$lib/components/ui/button";
import { Input } from "$lib/components/ui/input";
import { Textarea } from "$lib/components/ui/textarea";
import { getDisplayClock } from "$lib/time/display-clock";
import RunBuilder from "./RunBuilder.svelte";

let { data, form } = $props();
const clock = getDisplayClock();
const dataset = $derived(data.dataset);
let addCaseForm: HTMLFormElement | null = $state(null);
let deleteForm: HTMLFormElement | null = $state(null);
let confirmDelete = $state(false);

const keepValues =
	() =>
	async ({ update }: { update: (options?: { reset?: boolean }) => Promise<void> }) =>
		update({ reset: false });
</script>

<svelte:head> <title>{dataset.name} · LLM Lab · Libiamo</title> </svelte:head>

<div class="space-y-8">
	<header class="space-y-2">
		<Button href="{base}/admin/lab/datasets" variant="ghost" size="sm" class="-ml-3"><ArrowLeft aria-hidden="true" />Datasets</Button>
		<h1>{dataset.name}</h1>
		<p class="text-sm text-muted-foreground">{data.recipe?.title ?? dataset.recipeId}{dataset.description ? ` · ${dataset.description}` : ""}</p>
		<Accordion title="Edit dataset" class="max-w-2xl">
			<FormErrorFocus errors={form?.errors} fieldOrder={["name"]} />
			<form method="POST" action="?/update" use:enhance={keepValues} class="space-y-4">
				<Field label="Name" for="dataset-name" name="name" required error={form?.errors?.name?.[0]}>
					<Input id="dataset-name" name="name" value={dataset.name} required maxlength={120} aria-invalid={Boolean(form?.errors?.name)} />
				</Field>
				<Field label="Question it answers" for="dataset-description">
					<Input id="dataset-description" name="description" value={dataset.description} />
				</Field>
				<Field label="Judge rubric" for="dataset-rubric">
					<Textarea id="dataset-rubric" name="judgeRubric" rows={4} value={dataset.judgeRubric ?? ""} />
				</Field>
				<div class="flex flex-wrap items-center gap-2">
					<Button type="submit" variant="secondary">Save</Button>
					<Button variant="destructive" aria-haspopup="dialog" onclick={() => (confirmDelete = true)}>Delete dataset</Button>
					{#if form?.updated}
						<p class="text-sm text-success" role="status">Saved.</p>
					{/if}
				</div>
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
		<h2 id="cases-heading">Cases <span class="font-sans text-base text-muted-foreground tabular-nums">({dataset.cases.length})</span></h2>
		{#if dataset.cases.length === 0}
			<p class="text-sm text-muted-foreground">No cases. Pin traces from the trace pages, or add a JSON input below.</p>
		{:else}
			<ul class="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
				{#each dataset.cases as item (item.id)}
					<li class="space-y-1 px-4 py-3">
						<div class="flex flex-wrap items-center gap-2">
							<form method="POST" action="?/updateCase" use:enhance={keepValues} class="flex min-w-0 flex-1 items-center gap-2">
								<input type="hidden" name="caseId" value={item.id}>
								<span class="shrink-0 text-xs text-muted-foreground tabular-nums">#{item.id}</span>
								<Input
									name="label"
									value={item.label}
									placeholder="Label"
									aria-label={`Label of case ${item.id}`}
									class="h-8 min-w-0 flex-1 pointer-coarse:h-10"
									onchange={(event) => event.currentTarget.form?.requestSubmit()}
								/>
							</form>
							<Button href="{base}/admin/lab/playground?case={item.id}" variant="secondary" size="sm">Playground</Button>
							{#if item.sourceTraceId}
								<Button href="{base}/admin/lab/traces/{item.sourceTraceId}" variant="ghost" size="sm">Source trace</Button>
							{/if}
							<form method="POST" action="?/deleteCase" use:enhance>
								<input type="hidden" name="caseId" value={item.id}>
								<Button type="submit" variant="destructive" size="sm" aria-label={`Remove case ${item.id}`}>Remove</Button>
							</form>
						</div>
						<p class="text-xs text-muted-foreground">
							Added {formatLabTime(item.createdAt, clock().timeZone)} · recipe v{item.recipeVersion}
							{data.recipe && data.recipe.version !== item.recipeVersion ? ` (current v${data.recipe.version}; input may no longer fit)` : ""}
							{#if item.sourceTraceId === null && item.sourceUserId === null && item.createdBy}
								· hand-written
							{/if}
						</p>
						<Accordion title="Input" variant="plain">
							<div class="text-sm"><ValueView value={item.input} /></div>
						</Accordion>
					</li>
				{/each}
			</ul>
		{/if}
		<Accordion title="Add a case from JSON" class="max-w-3xl">
			<FormErrorFocus formRef={addCaseForm} errors={form?.errors} fieldOrder={["input"]} />
			<form bind:this={addCaseForm} method="POST" action="?/addCase" use:enhance class="space-y-4">
				<Field label="Label" for="case-label"> <Input id="case-label" name="label" /> </Field>
				<Field label="Recipe input (JSON)" for="case-input" name="input" required error={form?.errors?.input?.[0]}>
					<Textarea
						id="case-input"
						name="input"
						rows={10}
						required
						spellcheck="false"
						value={"{}"}
						class="field-sizing-fixed font-mono text-xs"
						aria-invalid={Boolean(form?.errors?.input)}
					/>
				</Field>
				<Button type="submit" variant="secondary">Add case</Button>
			</form>
		</Accordion>
	</section>

	<section aria-labelledby="runs-heading" class="space-y-3">
		<h2 id="runs-heading">Runs</h2>
		{#if dataset.runs.length}
			<ul class="space-y-0.5">
				{#each dataset.runs as run (run.id)}
					<li>
						<a href="{base}/admin/lab/runs/{run.id}" class="nav-item -mx-3 text-foreground">
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
			<h2 id="new-run-heading">New run</h2>
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
