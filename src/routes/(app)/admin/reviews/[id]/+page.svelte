<script lang="ts">
import ArrowLeft from "@lucide/svelte/icons/arrow-left";
import Pencil from "@lucide/svelte/icons/pencil";
import X from "@lucide/svelte/icons/x";
import { enhance } from "$app/forms";
import { base } from "$app/paths";
import Notice from "$lib/components/common/Notice.svelte";
import { Badge } from "$lib/components/ui/badge";
import { Button } from "$lib/components/ui/button";
import { Input } from "$lib/components/ui/input";
import { LANGUAGE_LABELS, type LanguageCode, type UiVariant } from "$lib/constants";
import { getDisplayClock } from "$lib/time/display-clock";

const clock = getDisplayClock();

let { data } = $props();
let c = $derived(data.contribution);

let isTranslate = $derived(c.interactionType === "translate");
let statusBadge = $derived(
	c.status === "approved"
		? { label: "Approved", variant: "success" as const }
		: c.status === "rejected"
			? { label: "Rejected", variant: "destructive" as const }
			: { label: "Pending", variant: "warning" as const },
);

function fmtDate(d: Date | null): string {
	if (!d) return "";
	return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: clock().timeZone });
}
</script>

<svelte:head>
	<title>Review: {c.title} · Admin · Libiamo</title>
	<meta name="description" content="Inspect and manage user-contributed material.">
</svelte:head>

<div class="space-y-6">
	<Button href="{base}/admin/reviews" variant="ghost" size="sm" class="-ml-3"><ArrowLeft aria-hidden="true" />Contributions</Button>

	<div class="space-y-2">
		<div class="flex flex-wrap items-center gap-3">
			<h1>{c.title}</h1>
			<Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>
		</div>
		<p class="text-sm text-muted-foreground">
			Submitted by {c.contributorName ?? "Unknown"} ({c.contributorEmail ?? ""})
			{#if c.submittedAt}
				on {fmtDate(c.submittedAt)}
			{/if}
		</p>
	</div>

	{#snippet item(label: string, value: string, pre = false)}
		<div class="space-y-1">
			<dt class="text-sm text-muted-foreground">{label}</dt>
			<dd class="text-sm {pre ? 'whitespace-pre-wrap' : ''}">{value}</dd>
		</div>
	{/snippet}

	<dl class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
		{@render item("Language", LANGUAGE_LABELS[c.language as LanguageCode])}
		{@render item("Interaction type", c.interactionType)}
		{#if c.urgency}
			{@render item("Reply urgency", c.urgency)}
		{/if}
		{@render item("Interface", c.ui)}
	</dl>

	<dl class="space-y-4">
		{#if !isTranslate && c.shortObjective}
			{@render item("Short objective", c.shortObjective)}
		{/if}
		{#if c.description}
			{@render item("Description", c.description)}
		{/if}
		{#if c.agentPrompt}
			{@render item("Character notes", c.agentPrompt, true)}
		{/if}
		{#if c.objectives && c.objectives.length > 0}
			<div class="space-y-1">
				<dt class="text-sm text-muted-foreground">Objectives</dt>
				<dd>
					<ul class="list-inside list-disc text-sm">
						{#each c.objectives as obj}
							<li>{obj}</li>
						{/each}
					</ul>
				</dd>
			</div>
		{/if}
		{#if isTranslate && c.translationContext}
			{@render item("Translation context", c.translationContext)}
		{/if}
		{#if isTranslate && c.referenceParagraphs}
			<div class="space-y-1">
				<dt class="text-sm text-muted-foreground">Reference text</dt>
				<dd class="space-y-2">
					{#each c.referenceParagraphs as paragraph}
						<p class="whitespace-pre-wrap text-sm">{paragraph}</p>
					{/each}
				</dd>
			</div>
		{/if}
		{#if !isTranslate}
			<div class="space-y-1">
				<dt class="text-sm text-muted-foreground">Opening state</dt>
				<dd>
					<pre
						class="max-h-40 overflow-auto rounded-lg bg-foreground/[0.04] px-3 py-2 font-mono text-xs"
					>{(c.openingState as object) ? JSON.stringify(c.openingState, null, 2) : ""}</pre>
				</dd>
			</div>
			{#if c.source?.continuation}
				<div class="space-y-1">
					<dt class="text-sm text-muted-foreground">The rest of the real conversation</dt>
					<dd>
						<pre
							class="max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-foreground/[0.04] px-3 py-2 font-mono text-xs"
						>{c.source.continuation}</pre>
					</dd>
				</div>
			{/if}
		{/if}
	</dl>

	{#if c.reviewNotes}
		<Notice tone="danger" title="Review notes"><p>{c.reviewNotes}</p></Notice>
	{/if}

	{#if c.status === "pending"}
		<div class="flex flex-wrap items-center gap-3 border-t border-border pt-6">
			<Button href="{base}/admin/tasks/new?fromContribution={c.id}"><Pencil aria-hidden="true" />Edit and approve</Button>

			<form method="POST" action="?/reject" use:enhance class="flex flex-wrap items-center gap-2">
				<Input name="reviewNotes" aria-label="Reason for rejection" placeholder="Reason for rejection (optional)" class="w-64" />
				<Button type="submit" variant="destructive"><X aria-hidden="true" />Reject</Button>
			</form>
		</div>
	{/if}
</div>
