<script lang="ts">
import { enhance } from "$app/forms";
import ActionNotification from "$lib/components/ActionNotification.svelte";
import TemplateForm from "$lib/components/TemplateForm.svelte";
import { Button } from "$lib/components/ui/button";

let { form, data } = $props();

const actionNotification = $derived(
	form?.saved ? { variant: "success" as const, title: "Template saved", message: "Your template changes have been saved." } : null,
);
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<h1>Edit Template #{data.template.id}</h1>
		<form method="POST" action="?/delete" use:enhance><Button type="submit" variant="destructive" size="sm">Deactivate</Button></form>
	</div>

	<ActionNotification notification={actionNotification} />

	<TemplateForm template={data.template} variants={data.variants} {form} action="?/save" submitLabel="Save Changes" />
</div>
