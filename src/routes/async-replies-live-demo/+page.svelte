<script lang="ts">
import { untrack } from "svelte";
import { deserialize } from "$app/forms";
import {
	ASYNC_REPLY_DEMO_TASKS,
	type AsyncReplyDemoScenario,
	type AsyncReplyDemoTask,
	simulatedDemoDecision,
	wouldReachDemoMaxTurns,
} from "$lib/async-replies/live-demo";

let { data } = $props();
let taskId = $state(ASYNC_REPLY_DEMO_TASKS[0].id);
let task = $derived(data.tasks.find((candidate: AsyncReplyDemoTask) => candidate.id === taskId) as AsyncReplyDemoTask);
let messages = $state<Array<{ id: number | string; role: "user" | "assistant"; content: string }>>([]);
let artifacts = $state<any[]>([]);
let nowMinutes = $state(0);
let running = $state(false);
let version = $state(0);
let cancelled = $state(false);
let input = $state("");

function reset() {
	messages = task.seedMessages.map((message) => ({ ...message }));
	artifacts = [];
	nowMinutes = 0;
	version += 1;
	cancelled = wouldReachDemoMaxTurns(task, messages);
}

function addInterjection() {
	const content = input.trim() || "Actually, one more detail: I may be late.";
	messages = [...messages, { id: `user-${crypto.randomUUID()}`, role: "user", content }];
	input = "";
	version += 1;
	if (wouldReachDemoMaxTurns(task, messages)) cancelled = true;
}

async function runGeneration(instruction = "Respond to the latest conversation state.") {
	if (running || cancelled) return;
	running = true;
	const generationVersion = version;
	const body = new FormData();
	body.set("taskId", task.id);
	body.set("history", JSON.stringify(messages));
	body.set("instruction", instruction);
	const response = await fetch("?/run", { method: "POST", body });
	const action = deserialize(await response.text()) as any;
	const result = action?.data?.result;
	const stale = generationVersion !== version;
	artifacts = [
		{
			atMinutes: nowMinutes,
			stale,
			cancelled,
			error: action?.data?.error,
			requestMessages: result?.requestMessages,
			rawResponse: result?.rawResponse,
			parsedResult: result?.parsedResult,
			providerMetadata: result?.providerMetadata,
		},
		...artifacts,
	];
	if (!stale && !cancelled && result?.parsedResult?.deliveries) {
		messages = [
			...messages,
			...result.parsedResult.deliveries.map((delivery: { content: string }, index: number) => ({
				id: `agent-${Date.now()}-${index}`,
				role: "assistant" as const,
				content: delivery.content,
			})),
		];
	}
	running = false;
}

function simulateScenario(scenario: AsyncReplyDemoScenario) {
	const parsedResult = simulatedDemoDecision(scenario);
	artifacts = [
		{
			atMinutes: nowMinutes,
			stale: false,
			cancelled,
			simulated: true,
			parsedResult,
			requestMessages: [],
			rawResponse: JSON.stringify(parsedResult),
			providerMetadata: { simulated: true },
		},
		...artifacts,
	];
	if (scenario === "terminate_abuse") cancelled = true;
}

function simulateStale() {
	addInterjection();
	artifacts = [
		{
			atMinutes: nowMinutes,
			stale: true,
			cancelled,
			simulated: true,
			parsedResult: null,
			requestMessages: [],
			rawResponse: "Generation completed after a newer user message.",
			providerMetadata: { simulated: true },
		},
		...artifacts,
	];
}

$effect(() => {
	taskId;
	untrack(reset);
});
</script>

<svelte:head><title>Async Reply Lab · Libiamo</title></svelte:head>

<section class="mx-auto max-w-6xl space-y-6 py-8">
	<header class="border-y border-border py-5">
		<p class="text-xs uppercase tracking-[0.18em] text-muted-foreground">Development only · production prompt path</p>
		<h1 class="font-serif text-4xl">Asynchronous Reply Lab</h1>
	</header>

	<div class="flex flex-wrap gap-3">
		<select bind:value={taskId} class="rounded border bg-background px-3 py-2">
			{#each data.tasks as option}
				<option value={option.id}>{option.title}</option>
			{/each}
		</select>
		<button type="button" class="rounded border px-3 py-2" onclick={reset}>Reset</button>
		<button type="button" class="rounded border px-3 py-2" onclick={() => (nowMinutes += 30)}>Advance time +30m</button>
		<button
			type="button"
			class="rounded bg-foreground px-3 py-2 text-background disabled:opacity-50"
			disabled={running || cancelled}
			onclick={() => runGeneration()}
		>
			{running ? "Generating… interject now to make it stale" : "Run / repeat generation"}
		</button>
		<button type="button" class="rounded border px-3 py-2" onclick={() => simulateScenario("no_reply")}>Simulate no-reply</button>
		<button type="button" class="rounded border px-3 py-2" onclick={() => simulateScenario("follow_up")}>Simulate follow-up</button>
		<button type="button" class="rounded border px-3 py-2" onclick={() => simulateScenario("terminate_abuse")}>Simulate abuse termination</button>
		<button type="button" class="rounded border px-3 py-2" onclick={simulateStale}>Simulate stale generation</button>
	</div>

	<div class="grid gap-6 lg:grid-cols-2">
		<div class="space-y-4 rounded border bg-card p-5">
			<div class="flex justify-between text-sm"><span>{task.ui} · {task.urgency}</span><span>T+{nowMinutes}m · maxTurns {task.maxTurns}</span></div>
			<div class="min-h-72 space-y-2 rounded bg-muted/40 p-4">
				{#each messages as message}
					<article class="rounded border bg-background p-3">
						<b>{message.role}</b>
						<p class="whitespace-pre-wrap">{message.content}</p>
					</article>
				{/each}
			</div>
			<div class="flex gap-2">
				<input
					bind:value={input}
					class="min-w-0 flex-1 rounded border bg-background px-3"
					placeholder="Interject during generation or add another turn"
				>
				<button type="button" class="rounded border px-3 py-2" onclick={addInterjection}>Add user message</button>
			</div>
			{#if cancelled}
				<p class="rounded border border-red-400 bg-red-50 p-3 text-red-800">
					Cancelled: maxTurns reached immediately after saving the final user message. No new batch may run.
				</p>
			{/if}
		</div>

		<div class="space-y-4">
			{#if artifacts.length === 0}
				<p class="rounded border p-5 text-muted-foreground">
					Run a generation to inspect exact prompts, raw response, parsed result, usage, repair, stale and cancelled state.
				</p>
			{/if}
			{#each artifacts as artifact}
				<details open class="rounded border bg-card p-4">
					<summary class="cursor-pointer font-semibold">
						T+{artifact.atMinutes}m · {artifact.parsedResult?.decision ?? "error"} · stale={artifact.stale}
						· cancelled={artifact.cancelled}
					</summary>
					<h3 class="mt-3 font-semibold">Exact prompts</h3>
					<pre>{JSON.stringify(artifact.requestMessages, null, 2)}</pre>
					<h3 class="mt-3 font-semibold">Raw response</h3>
					<pre>{artifact.rawResponse ?? artifact.error}</pre>
					<h3 class="mt-3 font-semibold">Parsed result</h3>
					<pre>{JSON.stringify(artifact.parsedResult, null, 2)}</pre>
					<h3 class="mt-3 font-semibold">Provider / usage / repair</h3>
					<pre>{JSON.stringify(artifact.providerMetadata, null, 2)}</pre>
				</details>
			{/each}
		</div>
	</div>
</section>

<style>
pre {
	overflow: auto;
	max-height: 22rem;
	margin-top: 0.35rem;
	border-radius: 0.35rem;
	background: color-mix(in oklab, var(--muted) 65%, transparent);
	padding: 0.75rem;
	font-size: 0.72rem;
	white-space: pre-wrap;
}
</style>
