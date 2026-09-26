<script lang="ts">
import { enhance } from "$app/forms";
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
		<h1 class="text-3xl">My overrides</h1>
		<p class="text-sm text-muted-foreground">
			Try a prompt or model in the real app on your own account. Only your calls change; each one is traced as an override so you can review it here.
			Calls routed to an explicit provider never use trial quota.
		</p>
	</div>

	{#each shown as recipe (recipe.id)}
		{@const saved = data.overrides.find((override) => override.recipeId === recipe.id) ?? null}
		<section class="space-y-3 rounded-lg border border-border p-4" aria-labelledby={`override-${recipe.id}`}>
			<div class="flex flex-wrap items-baseline justify-between gap-2">
				<h2 id={`override-${recipe.id}`} class="font-serif text-xl">
					{recipe.title}
					{#if saved && !saved.enabled}
						<span class="text-sm text-muted-foreground">(off)</span>
					{/if}
				</h2>
				{#if saved}
					<form method="POST" action="?/delete" use:enhance>
						<input type="hidden" name="recipeId" value={recipe.id}>
						<button type="submit" class="inline-flex min-h-11 items-center text-sm text-muted-foreground underline-offset-2 hover:underline">
							Remove override
						</button>
					</form>
				{/if}
			</div>
			{#if recipe.slots.length === 0}
				<p class="text-sm text-muted-foreground">This recipe has no slots yet; an override can change its provider and temperature.</p>
			{/if}
			<OverrideEditor {recipe} providers={data.providers} {saved} message={messageFor(recipe.id)} />
		</section>
	{:else}
		<p class="text-muted-foreground">No overrides. Every call you make uses the code defaults.</p>
	{/each}

	{#if available.length}
		<label class="grid max-w-md gap-1 text-sm">
			Add an override for
			<select
				class="h-11 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				bind:value={adding}
			>
				<option value="">Choose a recipe…</option>
				{#each available as recipe}
					<option value={recipe.id}>{recipe.title}</option>
				{/each}
			</select>
		</label>
	{/if}
</div>
