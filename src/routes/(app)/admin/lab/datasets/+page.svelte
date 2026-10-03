<script lang="ts">
import { enhance } from "$app/forms";
import { base } from "$app/paths";
import Field from "$lib/components/common/Field.svelte";
import FormErrorFocus from "$lib/components/common/FormErrorFocus.svelte";
import Select from "$lib/components/common/Select.svelte";
import { Button } from "$lib/components/ui/button";
import * as Card from "$lib/components/ui/card";
import { Input } from "$lib/components/ui/input";
import * as Table from "$lib/components/ui/table";
import { Textarea } from "$lib/components/ui/textarea";

let { data, form } = $props();
let createForm: HTMLFormElement | null = $state(null);
const recipeTitles = $derived(new Map(data.recipes.map((recipe) => [recipe.id, recipe.title])));
</script>

<svelte:head> <title>Datasets · LLM Lab · Libiamo</title> </svelte:head>

<div class="space-y-8">
	<div class="space-y-1">
		<h1>Datasets</h1>
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
						<Table.Cell>{recipeTitles.get(dataset.recipeId) ?? dataset.recipeId}</Table.Cell>
						<Table.Cell class="text-right tabular-nums">{dataset.caseCount}</Table.Cell>
						<Table.Cell class="text-right tabular-nums">{dataset.runCount}</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	{:else}
		<p class="text-sm text-muted-foreground">No datasets yet. Pin a trace, or create an empty dataset and add JSON cases.</p>
	{/if}

	<Card.Root class="max-w-2xl">
		<Card.Header><h2 id="new-dataset">New dataset</h2></Card.Header>
		<Card.Content>
			<FormErrorFocus formRef={createForm} errors={form?.errors} fieldOrder={["name", "recipeId"]} />
			<form bind:this={createForm} method="POST" action="?/create" use:enhance class="space-y-4" aria-labelledby="new-dataset">
				<Field label="Name" for="dataset-name" name="name" required error={form?.errors?.name?.[0]}>
					<Input id="dataset-name" name="name" required maxlength={120} aria-invalid={Boolean(form?.errors?.name)} />
				</Field>
				<Field label="Recipe" for="dataset-recipe" name="recipeId" error={form?.errors?.recipeId?.[0]}>
					<Select
						id="dataset-recipe"
						name="recipeId"
						value={data.recipes[0]?.id ?? ""}
						aria-invalid={Boolean(form?.errors?.recipeId)}
						items={data.recipes.map((recipe) => ({ value: recipe.id, label: recipe.title }))}
					/>
				</Field>
				<Field label="Question it answers" for="dataset-description">
					<Input id="dataset-description" name="description" placeholder="Do Notes teach reusable expressions rather than task details?" />
				</Field>
				<Field label="Judge rubric (optional)" for="dataset-rubric">
					<Textarea
						id="dataset-rubric"
						name="judgeRubric"
						rows={4}
						placeholder="Score 5 when every vocab is a reusable expression that does not depend on the task's world…"
					/>
				</Field>
				<Button type="submit">Create dataset</Button>
			</form>
		</Card.Content>
	</Card.Root>
</div>
