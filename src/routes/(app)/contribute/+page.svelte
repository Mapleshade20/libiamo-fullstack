<script lang="ts">
import { page } from "$app/state";
import TemplateForm from "$lib/components/TemplateForm.svelte";
import { Badge } from "$lib/components/ui/badge";

let { data, form } = $props();

let success = $derived(page.url.searchParams.get("success") === "1");

function formatDate(d: Date | null): string {
	if (!d) return "";
	return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}
</script>

<div class="space-y-10">
	<h1 class="text-3xl md:text-4xl text-gray-800 font-medium">Contribute a Template</h1>

	{#if success}
		<div class="rounded-md bg-green-50 p-4 space-y-2">
			<p class="text-sm text-green-700">Your template has been submitted for review. An admin will review it soon. Thanks for your contribution!</p>
			<a href="/" class="inline-block text-sm font-medium text-green-700 underline underline-offset-2 hover:text-green-800">
				&larr; Back to Quests
			</a>
		</div>
	{:else}
		<p class="text-muted-foreground">Propose a new learning scenario. Your submission will be reviewed by an admin before it goes live.</p>
		<TemplateForm {form} submitLabel="Submit for Review" cancelHref="/" hideAdminFields />
	{/if}

	<!-- Contribution History -->
	{#if data.contributions && data.contributions.length > 0}
		<div class="space-y-4">
			<h2 class="text-xl text-gray-800 font-medium">Your Contributions</h2>
			<div class="space-y-3">
				{#each data.contributions as c}
					<div class="flex items-center justify-between rounded-md border border-border p-3">
						<div class="min-w-0 flex-1">
							<p class="text-sm truncate">{c.titleBase}</p>
							<p class="text-xs text-muted-foreground">{c.interactionType} &middot; {c.ui} &middot; {formatDate(c.submittedAt)}</p>
							{#if c.status === "rejected" && c.reviewNotes}
								<p class="text-xs text-red-600 mt-1">Reason: {c.reviewNotes}</p>
							{/if}
						</div>
						<div class="ml-4 shrink-0">
							{#if c.status === "approved"}
								<Badge variant="outline" class="bg-green-100 text-green-700 border-green-200">Approved</Badge>
							{:else if c.status === "rejected"}
								<Badge variant="outline" class="bg-red-100 text-red-700 border-red-200">Rejected</Badge>
							{:else}
								<Badge variant="outline" class="bg-yellow-100 text-yellow-700 border-yellow-200">Pending</Badge>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>
