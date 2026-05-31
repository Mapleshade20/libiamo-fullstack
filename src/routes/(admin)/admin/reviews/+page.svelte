<script lang="ts">
import { Badge } from "$lib/components/ui/badge";
import * as Table from "$lib/components/ui/table";
import { type LanguageCode } from "$lib/constants";

let { data } = $props();

function formatDate(date: Date | null): string {
	if (!date) return "Unknown";
	return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}
</script>

<svelte:head>
	<title>Review Pool · Admin · Libiamo</title>
	<meta name="description" content="Manage and review user-contributed material awaiting approval.">
</svelte:head>

<div class="space-y-6">
	<h1>Review Pool</h1>

	{#if data.pendingContributions.length === 0}
		<p class="text-muted-foreground">No pending contributions to review.</p>
	{:else}
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head>ID</Table.Head>
					<Table.Head>Title</Table.Head>
					<Table.Head>Lang</Table.Head>
					<Table.Head>Type</Table.Head>
					<Table.Head>Contributor</Table.Head>
					<Table.Head>Submitted</Table.Head>
					<Table.Head>Actions</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each data.pendingContributions as c}
					<Table.Row>
						<Table.Cell>{c.id}</Table.Cell>
						<Table.Cell class="max-w-[200px] truncate"> <a href="/admin/reviews/{c.id}" class="hover:underline">{c.titleBase}</a> </Table.Cell>
						<Table.Cell><Badge variant="outline">{(c.language as LanguageCode).toUpperCase()}</Badge></Table.Cell>
						<Table.Cell class="text-xs">{c.interactionType}</Table.Cell>
						<Table.Cell>
							<div>
								<div class="text-sm">{c.contributorName ?? "Unknown"}</div>
								<div class="text-xs text-muted-foreground">{c.contributorEmail ?? ""}</div>
							</div>
						</Table.Cell>
						<Table.Cell class="text-xs text-muted-foreground">{formatDate(c.submittedAt)}</Table.Cell>
						<Table.Cell>
							<a href="/admin/reviews/{c.id}" class="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"> Review </a>
						</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	{/if}
</div>
