<script lang="ts">
import ArrowLeft from "@lucide/svelte/icons/arrow-left";
import LoaderCircle from "@lucide/svelte/icons/loader-circle";
import ThumbsDown from "@lucide/svelte/icons/thumbs-down";
import ThumbsUp from "@lucide/svelte/icons/thumbs-up";
import { enhance } from "$app/forms";
import { invalidate } from "$app/navigation";
import { base } from "$app/paths";
import { LLM_LAB_RUN_DEPENDENCY } from "$lib/app/load-dependencies";
import Accordion from "$lib/components/common/Accordion.svelte";
import ConfirmDialog from "$lib/components/common/ConfirmDialog.svelte";
import { formatLabTime, formatLatency } from "$lib/components/llm/format";
import OutputView from "$lib/components/llm/OutputView.svelte";
import { Button } from "$lib/components/ui/button";
import * as Table from "$lib/components/ui/table";
import { isRetryableCell, temperaturePlaceholder } from "$lib/llm/lab";
import { getDisplayClock } from "$lib/time/display-clock";

let { data } = $props();
const clock = getDisplayClock();
let deleteForm: HTMLFormElement | null = $state(null);
let confirmDelete = $state(false);

const unfinished = $derived(data.cells.some((cell) => cell.status === "pending" || cell.status === "running"));
const retryable = $derived(data.cells.filter(isRetryableCell).length);
const variantLabels = $derived(new Map(data.run.variants.map((variant) => [variant.key, variant.label])));
const finishedCount = $derived(data.cells.filter((cell) => cell.status !== "pending" && cell.status !== "running").length);

$effect(() => {
	if (!unfinished) return;
	const timer = setInterval(() => void invalidate(LLM_LAB_RUN_DEPENDENCY), 3_000);
	return () => clearInterval(timer);
});

function cellsFor(caseId: number, variantKey: string) {
	return data.cells.filter((cell) => cell.caseId === caseId && cell.variantKey === variantKey);
}

function mean(value: number | null, digits = 1): string {
	return value === null ? "—" : value.toFixed(digits);
}

const keepValues =
	() =>
	async ({ update }: { update: (options?: { reset?: boolean }) => Promise<void> }) =>
		update({ reset: false });
</script>

<svelte:head> <title>{data.run.label || `Run ${data.run.id}`} · LLM Lab · Libiamo</title> </svelte:head>

<div class="space-y-8">
	<header class="space-y-2">
		<Button href="{base}/admin/lab/datasets/{data.dataset.id}" variant="ghost" size="sm" class="-ml-3"
			><ArrowLeft aria-hidden="true" />{data.dataset.name}</Button
		>
		<h1>{data.run.label || `Run ${data.run.id}`}</h1>
		<p class="text-sm text-muted-foreground">
			{data.recipe?.title ?? data.dataset.recipeId}
			· {data.cases.length} cases × {data.run.variants.length} columns × {data.run.repeats} · started
			{formatLabTime(data.run.createdAt, clock().timeZone)}
		</p>
		<p class="flex items-center gap-2 text-sm" role="status">
			{#if unfinished}
				<LoaderCircle class="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
			{/if}
			<span class="tabular-nums">{finishedCount} / {data.cells.length} calls finished</span>
			{#if data.run.cancelledAt}
				<span class="text-muted-foreground">· cancelled</span>
			{/if}
		</p>
		<div class="flex flex-wrap gap-2">
			{#if unfinished}
				<form method="POST" action="?/cancel" use:enhance={keepValues}><Button type="submit" variant="secondary">Cancel run</Button></form>
			{/if}
			{#if retryable && !unfinished}
				<form method="POST" action="?/retry" use:enhance={keepValues}>
					<Button type="submit" variant="secondary">Retry {retryable} failed or cancelled call{retryable === 1 ? "" : "s"}</Button>
				</form>
			{/if}
			<Button variant="destructive" aria-haspopup="dialog" onclick={() => (confirmDelete = true)}>Delete run</Button>
		</div>
		<form bind:this={deleteForm} method="POST" action="?/delete" hidden></form>
		<ConfirmDialog
			bind:open={confirmDelete}
			title="Delete this run?"
			message="Its outputs, judge scores and ratings are deleted. The dataset and its cases stay."
			confirmLabel="Delete"
			cancelLabel="Cancel"
			onconfirm={() => deleteForm?.requestSubmit()}
		/>
	</header>

	<section aria-labelledby="stats-heading" class="space-y-3">
		<h2 id="stats-heading">Summary</h2>
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head>Column</Table.Head>
					<Table.Head class="text-right">Finished</Table.Head>
					<Table.Head class="text-right">OK</Table.Head>
					<Table.Head class="text-right">Failed</Table.Head>
					<Table.Head class="text-right">Repaired</Table.Head>
					<Table.Head class="text-right">Latency</Table.Head>
					<Table.Head class="text-right">Out tokens</Table.Head>
					<Table.Head class="text-right">Judge</Table.Head>
					<Table.Head class="text-right">Votes</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each data.stats as stats, index (stats.variantKey)}
					{@const variant = data.run.variants[index]}
					<Table.Row>
						<Table.Cell>
							<span class="font-medium">{variant.label}</span>
							<span class="block text-xs text-muted-foreground">
								{variant.providerRef}{variant.reasoningEffort ? ` · effort ${variant.reasoningEffort}` : ""}
								{` · t=${variant.temperature ?? (data.recipe ? temperaturePlaceholder(data.recipe) : "default")}`}
								{Object.keys(variant.slots).length ? ` · edited ${Object.keys(variant.slots).join(", ")}` : " · default prompt"}
							</span>
						</Table.Cell>
						<Table.Cell class="text-right tabular-nums">{stats.finished}/{stats.total}</Table.Cell>
						<Table.Cell class="text-right tabular-nums">{stats.ok}</Table.Cell>
						<Table.Cell class="text-right tabular-nums">{stats.failed}</Table.Cell>
						<Table.Cell class="text-right tabular-nums">{stats.repaired}</Table.Cell>
						<Table.Cell class="text-right tabular-nums"
							>{formatLatency(stats.meanLatencyMs === null ? null : Math.round(stats.meanLatencyMs))}</Table.Cell
						>
						<Table.Cell class="text-right tabular-nums">{mean(stats.meanCompletionTokens, 0)}</Table.Cell>
						<Table.Cell class="text-right tabular-nums">{mean(stats.meanJudgeScore)}{stats.judged ? ` (${stats.judged})` : ""}</Table.Cell>
						<Table.Cell class="text-right tabular-nums">+{stats.upVotes} / −{stats.downVotes}</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
		{#if data.run.judge}
			<Accordion title="Judge rubric" class="max-w-3xl">
				<p class="whitespace-pre-wrap text-sm">{data.run.judge.rubric}</p>
				<p class="mt-2 text-xs text-muted-foreground">Judge provider: {data.run.judge.providerRef}</p>
			</Accordion>
		{/if}
	</section>

	<section aria-labelledby="cases-heading" class="space-y-6">
		<h2 id="cases-heading">Outputs by case</h2>
		{#each data.cases as item (item.id)}
			<article class="space-y-3 border-t border-border pt-4" aria-labelledby={`case-${item.id}`}>
				<div class="flex flex-wrap items-baseline justify-between gap-2">
					<h3 id={`case-${item.id}`} class="font-medium">#{item.id} {item.label}</h3>
					<Button href="{base}/admin/lab/playground?case={item.id}" variant="ghost" size="sm">Playground</Button>
				</div>
				<div class="overflow-x-auto pb-2">
					<div class="grid gap-4" style={`grid-template-columns: repeat(${data.run.variants.length}, minmax(16rem, 1fr));`}>
						{#each data.run.variants as variant (variant.key)}
							<div class="min-w-0 space-y-3">
								<p class="text-sm font-medium">{variantLabels.get(variant.key)}</p>
								{#each cellsFor(item.id, variant.key) as cell (cell.id)}
									<div class="space-y-2 rounded-xl border border-border bg-card p-3">
										{#if cell.status === "pending" || cell.status === "running"}
											<p class="flex items-center gap-2 text-sm text-muted-foreground">
												<LoaderCircle class="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
												{cell.status === "pending" ? "Waiting" : "Running"}
											</p>
										{:else if cell.status === "cancelled"}
											<p class="text-sm text-muted-foreground">Cancelled</p>
										{:else if cell.status === "failed"}
											<p class="text-sm text-destructive">Could not run: {cell.error}</p>
										{:else}
											<OutputView
												recipeId={data.dataset.recipeId}
												output={cell.output}
												outputText={cell.outputText}
												error={cell.traceError}
												compact
											/>
											<p class="text-xs text-muted-foreground tabular-nums">
												{formatLatency(cell.latencyMs)}
												· {cell.completionTokens ?? "—"} tokens{cell.repaired ? " · repaired" : ""}
												{#if cell.traceId}
													· <a class="underline underline-offset-2" href="{base}/admin/lab/traces/{cell.traceId}">trace</a>
												{/if}
											</p>
											{#if cell.judge}
												{#if "score" in cell.judge}
													<Accordion title={`Judge: ${cell.judge.score}/5`} variant="plain">
														<p class="text-sm text-muted-foreground">{cell.judge.rationale}</p>
													</Accordion>
												{:else}
													<p class="text-xs text-destructive">Judge failed: {cell.judge.error}</p>
												{/if}
											{/if}
											{#if cell.traceId}
												<form method="POST" action="?/rate" use:enhance={keepValues} class="flex flex-wrap items-center gap-2">
													<input type="hidden" name="traceId" value={cell.traceId}>
													<input type="hidden" name="note" value={cell.myRating?.note ?? ""}>
													<Button
														type="submit"
														name="vote"
														value="1"
														variant="ghost"
														size="icon-sm"
														class="aria-pressed:bg-foreground/[0.08] aria-pressed:text-success"
														aria-label="Good"
														aria-pressed={cell.myRating?.vote === 1}
													>
														<ThumbsUp aria-hidden="true" />
													</Button>
													<Button
														type="submit"
														name="vote"
														value="-1"
														variant="ghost"
														size="icon-sm"
														class="aria-pressed:bg-foreground/[0.08] aria-pressed:text-destructive"
														aria-label="Bad"
														aria-pressed={cell.myRating?.vote === -1}
													>
														<ThumbsDown aria-hidden="true" />
													</Button>
													{#if cell.votes.length}
														<span class="text-xs text-muted-foreground tabular-nums"
															>+{cell.votes.filter((vote) => vote > 0).length}
															/ −{cell.votes.filter((vote) => vote < 0).length}</span
														>
													{/if}
												</form>
												{#if cell.notes.length}
													<ul class="space-y-1 text-xs text-muted-foreground">
														{#each cell.notes as note}
															<li>“{note}”</li>
														{/each}
													</ul>
												{/if}
											{/if}
										{/if}
									</div>
								{/each}
							</div>
						{/each}
					</div>
				</div>
			</article>
		{/each}
	</section>
</div>
