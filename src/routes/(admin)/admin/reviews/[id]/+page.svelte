<script lang="ts">
import Check from "@lucide/svelte/icons/check";
import X from "@lucide/svelte/icons/x";
import { enhance } from "$app/forms";
import { Badge } from "$lib/components/ui/badge";
import { Button } from "$lib/components/ui/button";
import { Label } from "$lib/components/ui/label";
import { LANGUAGE_LABELS, type LanguageCode, type UiVariant } from "$lib/constants";
import { renderMarkdown } from "$lib/markdown";

let { data } = $props();
let c = $derived(data.contribution);

let isTranslate = $derived(c.interactionType === "translate");
let statusBadge = $derived(
	c.status === "approved"
		? { label: "Approved", class: "bg-green-100 text-green-700 border-green-200" }
		: c.status === "rejected"
			? { label: "Rejected", class: "bg-red-100 text-red-700 border-red-200" }
			: { label: "Pending", class: "bg-yellow-100 text-yellow-700 border-yellow-200" },
);

function fmtDate(d: Date | null): string {
	if (!d) return "";
	return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<a href="/admin/reviews" class="text-sm text-muted-foreground hover:text-foreground underline underline-offset-2">&larr; Back to Review Pool</a>
		<Badge variant="outline" class={statusBadge.class}>{statusBadge.label}</Badge>
	</div>

	<h1 class="text-3xl text-gray-800 font-medium">Review: {c.titleBase}</h1>

	<!-- Contributor info -->
	<div class="text-sm text-muted-foreground">
		Submitted by {c.contributorName ?? "Unknown"} ({c.contributorEmail ?? ""})
		{#if c.submittedAt}
			on {fmtDate(c.submittedAt)}
		{/if}
	</div>

	<!-- Metadata -->
	<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
		<div class="space-y-1">
			<Label class="text-xs text-muted-foreground">Language</Label>
			<p class="text-sm">{LANGUAGE_LABELS[c.language as LanguageCode]}</p>
		</div>
		<div class="space-y-1">
			<Label class="text-xs text-muted-foreground">Interaction Type</Label>
			<p class="text-sm">{c.interactionType}</p>
		</div>
		<div class="space-y-1">
			<Label class="text-xs text-muted-foreground">UI</Label>
			<p class="text-sm">{c.ui}</p>
		</div>
		{#if c.cadence}
			<div class="space-y-1">
				<Label class="text-xs text-muted-foreground">Cadence</Label>
				<p class="text-sm capitalize">{c.cadence}</p>
			</div>
		{/if}
		{#if c.difficulty}
			<div class="space-y-1">
				<Label class="text-xs text-muted-foreground">Difficulty</Label>
				<p class="text-sm">{c.difficulty}</p>
			</div>
		{/if}
	</div>

	<!-- Content -->
	{#if c.shortObjectiveBase}
		<div class="space-y-1">
			<Label class="text-xs text-muted-foreground">Short Objective</Label>
			<p class="text-sm">{c.shortObjectiveBase}</p>
		</div>
	{/if}

	{#if c.descriptionBase}
		<div class="space-y-1">
			<Label class="text-xs text-muted-foreground">Description</Label>
			<p class="text-sm">{c.descriptionBase}</p>
		</div>
	{/if}

	{#if c.agentPromptBase}
		<div class="space-y-1">
			<Label class="text-xs text-muted-foreground">Agent Prompt</Label>
			<p class="text-sm whitespace-pre-wrap">{c.agentPromptBase}</p>
		</div>
	{/if}

	{#if c.objectivesBase && c.objectivesBase.length > 0}
		<div class="space-y-1">
			<Label class="text-xs text-muted-foreground">Objectives</Label>
			<ul class="list-disc list-inside text-sm">
				{#each c.objectivesBase as obj}
					<li>{obj}</li>
				{/each}
			</ul>
		</div>
	{/if}

	{#if c.tags && c.tags.length > 0}
		<div class="space-y-1">
			<Label class="text-xs text-muted-foreground">Tags</Label>
			<div class="flex flex-wrap gap-1">
				{#each c.tags as tag}
					<Badge variant="secondary">{tag}</Badge>
				{/each}
			</div>
		</div>
	{/if}

	{#if c.materialsMd}
		<div class="space-y-1">
			<Label class="text-xs text-muted-foreground">Background Material</Label>
			<div class="prose prose-neutral max-w-none text-sm">{@html renderMarkdown(c.materialsMd)}</div>
		</div>
	{/if}

	{#if isTranslate && c.translationBase}
		<div class="space-y-1">
			<Label class="text-xs text-muted-foreground">Source Text</Label>
			<div class="space-y-2">
				{#each c.translationBase as paragraph}
					<p class="text-sm">
						{#each paragraph as sentence}
							{sentence}
						{/each}
					</p>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Variant -->
	{#if !isTranslate}
		<div class="space-y-3">
			<div class="space-y-1">
				<Label class="text-xs text-muted-foreground">Slot Values</Label>
				<pre
					class="text-xs bg-muted rounded px-2 py-1 overflow-auto max-h-20"
				>{(c.slotValues as object) ? JSON.stringify(c.slotValues, null, 2) : ""}</pre>
			</div>
			<div class="space-y-1">
				<Label class="text-xs text-muted-foreground">Opening State</Label>
				<pre
					class="text-xs bg-muted rounded px-2 py-1 overflow-auto max-h-40"
				>{(c.openingState as object) ? JSON.stringify(c.openingState, null, 2) : ""}</pre>
			</div>
		</div>
	{/if}

	<!-- Review notes (rejected) -->
	{#if c.reviewNotes}
		<div class="rounded-md bg-red-50 p-4 text-sm text-red-700"><span class="font-medium">Review Notes:</span> {c.reviewNotes}</div>
	{/if}

	<!-- Actions (only for pending) -->
	{#if c.status === "pending"}
		<div class="h-px bg-border"></div>
		<div class="flex items-center gap-3">
			<form method="POST" action="?/approve" use:enhance>
				<Button type="submit" class="bg-green-600 hover:bg-green-700 text-white">
					<Check size={16} class="mr-1.5" />
					Approve
				</Button>
			</form>
			<form method="POST" action="?/reject" use:enhance class="flex items-center gap-2">
				<input
					type="text"
					name="reviewNotes"
					placeholder="Reason for rejection (optional)"
					class="rounded-md border border-input bg-background px-3 py-1.5 text-sm w-64"
				>
				<Button type="submit" variant="destructive">
					<X size={16} class="mr-1.5" />
					Reject
				</Button>
			</form>
		</div>
	{/if}
</div>
