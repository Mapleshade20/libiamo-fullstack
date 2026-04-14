<script lang="ts">
import { enhance } from "$app/forms";
import TemplateForm from "$lib/components/TemplateForm.svelte";
import { Button } from "$lib/components/ui/button";

let { form, data } = $props();
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<h1 class="text-2xl font-bold">Edit Template #{data.template.id}</h1>
		<form method="POST" action="?/delete" use:enhance><Button type="submit" variant="destructive" size="sm">Deactivate</Button></form>
	</div>

	{#if form?.saved}
		<p class="rounded-md bg-green-50 p-3 text-sm text-green-700">Template saved.</p>
	{/if}

	<TemplateForm template={data.template} variants={data.variants} {form} action="?/save" submitLabel="Save Changes" />
</div>
