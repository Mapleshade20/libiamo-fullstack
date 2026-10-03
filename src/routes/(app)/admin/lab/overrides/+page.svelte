<script lang="ts">
import { enhance } from "$app/forms";
import Select from "$lib/components/common/Select.svelte";
import { Button } from "$lib/components/ui/button";
import OverrideEditor from "./OverrideEditor.svelte";

let { data, form } = $props();
let adding = $state("");

const overridden = $derived(new Set(data.overrides.map((override) => override.recipeId)));
const shown = $derived(data.recipes.filter((recipe) => overridden.has(recipe.id) || recipe.id === adding));
const available = $derived(data.recipes.filter((recipe) => !overridden.has(recipe.id) && recipe.id !== "lab.judge"));

function messageFor(recipeId: string) {
	if (form?.saved === recipeId) return { saved: true };
	if (form && "recipeId" in form && form.recipeId === recipeId && form.error) return { error: form.error };
	return null;
}
</script>

<svelte:head> <title>My overrides · LLM Lab · Libiamo</title> </svelte:head>

<div class="space-y-8">
	<div class="space-y-1">
		<h1>My overrides</h1>
		<p class="text-sm text-muted-foreground">
			Try a prompt or model in the real app on your own account. Only your calls change; each one is traced as an override so you can review it here.
			Calls routed to an explicit provider never use trial quota.
		</p>
	</div>

	{#each shown as recipe (recipe.id)}
		{@const saved = data.overrides.find((override) => override.recipeId === recipe.id) ?? null}
		<section class="space-y-4 rounded-xl border border-border bg-card p-5" aria-labelledby={`override-${recipe.id}`}>
			<div class="flex flex-wrap items-baseline justify-between gap-2">
				<h2 id={`override-${recipe.id}`}>
					{recipe.title}
					{#if saved && !saved.enabled}
						<span class="font-sans text-sm text-muted-foreground">(off)</span>
					{/if}
				</h2>
				{#if saved}
					<form method="POST" action="?/delete" use:enhance>
						<input type="hidden" name="recipeId" value={recipe.id}>
						<Button type="submit" variant="destructive" size="sm">Remove override</Button>
					</form>
				{/if}
			</div>
			{#if recipe.slots.length === 0}
				<p class="text-sm text-muted-foreground">This recipe has no slots yet; an override can change its provider and temperature.</p>
			{/if}
			<OverrideEditor {recipe} providers={data.providers} {saved} message={messageFor(recipe.id)} />
		</section>
	{:else}
		<p class="text-sm text-muted-foreground">No overrides. Every call you make uses the code defaults.</p>
	{/each}

	{#if available.length}
		<div class="flex max-w-md flex-col gap-1.5">
			<label for="override-add" class="text-sm font-medium">Add an override for</label>
			<Select
				id="override-add"
				bind:value={adding}
				placeholder="Choose a recipe…"
				items={available.map((recipe) => ({ value: recipe.id, label: recipe.title }))}
			/>
		</div>
	{/if}
</div>
