<script lang="ts">
import { enhance } from "$app/forms";
import { base } from "$app/paths";
import FormErrorFocus from "$lib/components/common/FormErrorFocus.svelte";
import * as Table from "$lib/components/ui/table";

let { data, form } = $props();
let createForm: HTMLFormElement | null = $state(null);
const recipeTitles = $derived(new Map(data.recipes.map((recipe) => [recipe.id, recipe.title])));
const fieldClass =
	"w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-invalid:border-destructive";
</script>

<svelte:head> <title>Datasets · LLM Lab · Libiamo</title> </svelte:head>

<div class="space-y-8">
	<div class="space-y-1">
		<h1 class="text-3xl">Datasets</h1>
		<p class="text-sm text-muted-foreground">
			Each dataset gathers inputs of one recipe around a question, such as whether Notes absorb task-specific details.
		</p>
	</div>

	{#if data.datasets.length}
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head>Name</Table.Head>
					<Table.Head>Recipe</Table.Head>
					<Table.Head class="text-right">Cases</Table.Head>
					<Table.Head class="text-right">Runs</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each data.datasets as dataset (dataset.id)}
					<Table.Row>
						<Table.Cell>
							<a href="{base}/admin/lab/datasets/{dataset.id}" class="font-medium hover:underline">{dataset.name}</a>
							{#if dataset.description}
								<p class="text-xs text-muted-foreground">{dataset.description}</p>
							{/if}
						</Table.Cell>
						<Table.Cell class="text-xs">{recipeTitles.get(dataset.recipeId) ?? dataset.recipeId}</Table.Cell>
						<Table.Cell class="text-right tabular-nums">{dataset.caseCount}</Table.Cell>
						<Table.Cell class="text-right tabular-nums">{dataset.runCount}</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	{:else}
		<p class="text-muted-foreground">No datasets yet. Pin a trace, or create an empty dataset and add JSON cases.</p>
	{/if}

	<section aria-labelledby="new-dataset" class="max-w-2xl space-y-3 rounded-lg border border-border p-4">
		<h2 id="new-dataset" class="font-serif text-xl">New dataset</h2>
		<FormErrorFocus formRef={createForm} errors={form?.errors} fieldOrder={["name", "recipeId"]} />
		<form bind:this={createForm} method="POST" action="?/create" use:enhance class="space-y-3">
			<label class="grid gap-1 text-sm">
				Name
				<input name="name" required maxlength="120" class="{fieldClass} h-11" aria-invalid={Boolean(form?.errors?.name)}>
				{#if form?.errors?.name}
					<span data-field-error="name" class="text-sm text-destructive">{form.errors.name[0]}</span>
				{/if}
			</label>
			<label class="grid gap-1 text-sm">
				Recipe
				<select name="recipeId" class="{fieldClass} h-11" aria-invalid={Boolean(form?.errors?.recipeId)}>
					{#each data.recipes as recipe}
						<option value={recipe.id}>{recipe.title}</option>
					{/each}
				</select>
				{#if form?.errors?.recipeId}
					<span data-field-error="recipeId" class="text-sm text-destructive">{form.errors.recipeId[0]}</span>
				{/if}
			</label>
			<label class="grid gap-1 text-sm">
				Question it answers
				<input name="description" class="{fieldClass} h-11" placeholder="Do Notes teach reusable expressions rather than task details?">
			</label>
			<label class="grid gap-1 text-sm">
				Judge rubric (optional)
				<textarea
					name="judgeRubric"
					rows="4"
					class="{fieldClass} py-2"
					placeholder="Score 5 when every vocab is a reusable expression that does not depend on the task's world…"
				></textarea>
			</label>
			<button
				type="submit"
				class="inline-flex min-h-11 items-center rounded-md border border-border px-4 text-sm hover:bg-secondary focus-visible:outline-2 focus-visible:outline-ring"
			>
				Create dataset
			</button>
		</form>
	</section>
</div>
