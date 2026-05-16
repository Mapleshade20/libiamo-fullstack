<script lang="ts">
import Check from "@lucide/svelte/icons/check";
import X from "@lucide/svelte/icons/x";
import { enhance } from "$app/forms";
import { Badge } from "$lib/components/ui/badge";
import * as Table from "$lib/components/ui/table";
import { type LanguageCode } from "$lib/constants";

let { data } = $props();

function formatDate(date: Date | null): string {
	if (!date) return "Unknown";
	return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}
</script>

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
						<Table.Cell class="max-w-[200px] truncate">{c.titleBase}</Table.Cell>
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
							<div class="flex items-center gap-2">
								<form method="POST" action="?/approve" use:enhance>
									<input type="hidden" name="id" value={c.id}>
									<button
										type="submit"
										class="flex items-center gap-1 rounded px-2 py-1 text-xs bg-green-100 text-green-700 hover:bg-green-200 transition-colors"
									>
										<Check size={12} />
										Approve
									</button>
								</form>

								<form method="POST" action="?/reject" use:enhance>
									<input type="hidden" name="id" value={c.id}>
									<button
										type="submit"
										class="flex items-center gap-1 rounded px-2 py-1 text-xs bg-red-100 text-red-700 hover:bg-red-200 transition-colors"
									>
										<X size={12} />
										Reject
									</button>
								</form>
							</div>
						</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	{/if}
</div>
