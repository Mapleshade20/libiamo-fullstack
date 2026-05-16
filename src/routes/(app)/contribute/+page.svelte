<script lang="ts">
import { page } from "$app/state";
import TemplateForm from "$lib/components/TemplateForm.svelte";

let { form } = $props();

let success = $derived(page.url.searchParams.get("success") === "1");
</script>

<div class="space-y-6">
	<h1 class="text-3xl md:text-4xl text-gray-800 font-medium">Contribute a Template</h1>

	{#if success}
		<p class="rounded-md bg-green-50 p-4 text-sm text-green-700">
			Your template has been submitted for review. An admin will review it soon. Thanks for your contribution!
		</p>
		<a href="/" class="mt-4 inline-block text-sm text-primary underline underline-offset-2 hover:opacity-80">Back to Quest Hall</a>
	{:else}
		<p class="text-muted-foreground">Propose a new learning scenario. Your submission will be reviewed by an admin before it goes live.</p>
		<TemplateForm {form} submitLabel="Submit for Review" cancelHref="/" hideAdminFields />
	{/if}
</div>
