<script lang="ts">
import { SvelteSet } from "svelte/reactivity";
import {
	type Capture,
	type CaptureChoice,
	type CapturedMessage,
	cutCapture,
	joinChatAt,
	parseCapture,
	withAncestors,
	withDescendants,
} from "$lib/admin/capture";
import { CAPTURE_SCRIPTS, type CapturePlatform } from "$lib/admin/capture-scripts";
import Accordion from "$lib/components/common/Accordion.svelte";
import { Button } from "$lib/components/ui/button";
import { Label } from "$lib/components/ui/label";
import { Textarea } from "$lib/components/ui/textarea";

let { language, onimport }: { language: string; onimport: (cut: ReturnType<typeof cutCapture>) => void } = $props();

const PLATFORMS: Array<{ platform: CapturePlatform; label: string; how: string }> = [
	{ platform: "reddit", label: "Reddit", how: "on the post. Or open the post's address with .json added at the end and copy the whole page." },
	{ platform: "ao3", label: "AO3", how: "on the chapter whose comments you want (a one-shot's work page is its only chapter)." },
	{ platform: "discord", label: "Discord", how: "in the channel, after scrolling up until the history you want is loaded." },
];
/** Openings larger than this make every reply slower and costlier. */
const LARGE_OPENING = 60;

let pasted = $state("");
let copied = $state<CapturePlatform | null>(null);
const parsed = $derived(pasted.trim() ? parseCapture(pasted) : null);
const capture = $derived<Capture | null>(parsed?.success ? parsed.capture : null);
const byId = $derived(new Map(capture?.messages.map((message) => [message.id, message])));
const replies = $derived(Map.groupBy(capture?.messages ?? [], (message) => message.parent ?? ""));

// A chat is joined at one message; a thread's opening is chosen comment by comment.
let joinedAt = $state<string | null>(null);
let chatOpening = $state(new Set<string>());
const chosen = new SvelteSet<string>();

$effect(() => {
	capture;
	joinedAt = null;
	chatOpening = new Set();
	chosen.clear();
});

async function copyScript(platform: CapturePlatform) {
	await navigator.clipboard.writeText(CAPTURE_SCRIPTS[platform]);
	copied = platform;
}

function apply(choice: CaptureChoice) {
	if (capture) onimport(cutCapture(capture, choice, language));
}

function join(message: CapturedMessage) {
	if (!capture) return;
	const choice = joinChatAt(capture, message.id);
	joinedAt = message.id;
	chatOpening = new Set(choice.opening);
	apply(choice);
}

/** Choosing a comment brings its ancestors along; leaving it out takes its replies with it. */
function toggle(message: CapturedMessage, on: boolean) {
	if (!capture) return;
	const changed = on ? withAncestors(capture, [message.id]) : withDescendants(capture, [message.id]);
	for (const id of changed) {
		if (on) chosen.add(id);
		else chosen.delete(id);
	}
	apply({ opening: [...chosen] });
}

function chooseAll(on: boolean) {
	chosen.clear();
	if (on) for (const message of capture?.messages ?? []) chosen.add(message.id);
	apply({ opening: [...chosen] });
}
</script>

{#snippet thread(parent: string)}
	<ul class={parent ? "ml-4 border-l pl-2" : "space-y-1"}>
		{#each replies.get(parent) ?? [] as message (message.id)}
			<li>
				<label
					class="flex min-h-11 cursor-pointer items-start gap-2 rounded px-2 py-1 hover:bg-muted {chosen.has(message.id) ? 'bg-emerald-50' : ''}"
				>
					<input
						type="checkbox"
						class="mt-1 size-4 shrink-0 accent-emerald-700"
						checked={chosen.has(message.id)}
						onchange={(event) => toggle(message, event.currentTarget.checked)}
					>
					<span class="min-w-0">
						<b>{message.author}</b>
						<span class="line-clamp-2 text-muted-foreground">{message.text}</span>
					</span>
				</label>
				{@render thread(message.id)}
			</li>
		{/each}
	</ul>
{/snippet}

<Accordion title="Import a real conversation">
	<div class="space-y-3 text-sm">
		<p class="text-muted-foreground">
			1. Open the page, then the browser's developer console (F12). Paste the platform's script and press Enter: it copies the conversation.
		</p>
		<ul class="space-y-2">
			{#each PLATFORMS as { platform, label, how }}
				<li class="flex flex-wrap items-center gap-2">
					<Button
						type="button"
						variant="outline"
						class="min-h-11 {copied === platform ? 'border-emerald-600 bg-emerald-50 text-emerald-800 hover:bg-emerald-50' : ''}"
						onclick={() => copyScript(platform)}
					>
						{copied === platform ? `✓ ${label} script copied` : `Copy the ${label} script`}
					</Button>
					<span class="text-xs text-muted-foreground">Run it {how}</span>
				</li>
			{/each}
		</ul>
		<div class="space-y-2">
			<Label for="capture">2. Paste what it copied</Label>
			<Textarea id="capture" rows={3} class="max-h-40" bind:value={pasted} />
			{#if parsed && !parsed.success}
				<p class="text-sm text-red-600">{parsed.error}</p>
			{/if}
		</div>
		{#if capture?.platform === "discord"}
			<p>
				3. Choose where the learner joins: they take that person's place. The lines before it open the channel; what follows is what the cast knows
				beyond it.
			</p>
			<ol class="max-h-96 space-y-1 overflow-y-auto rounded-md border p-1" aria-label="Captured messages">
				{#each capture.messages as message (message.id)}
					{@const parent = message.parent ? byId.get(message.parent) : undefined}
					<li>
						<button
							type="button"
							class="min-h-11 w-full rounded border-l-4 px-2 py-1 text-left hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring {message.id === joinedAt ? 'border-emerald-700 bg-emerald-50 ring-1 ring-emerald-600' : chatOpening.has(message.id) ? 'border-emerald-300' : 'border-transparent'}"
							aria-pressed={message.id === joinedAt}
							onclick={() => join(message)}
						>
							{#if message.id === joinedAt}
								<span class="mr-1 rounded bg-emerald-700 px-1.5 text-xs text-white">The learner joins here</span>
							{/if}
							<b>{message.author}</b>
							{#if parent}
								<span class="text-muted-foreground">↪ {parent.author}</span>
							{/if}
							<span class="line-clamp-2 text-muted-foreground">{message.text}</span>
						</button>
					</li>
				{/each}
			</ol>
			{#if joinedAt}
				<p role="status" class="rounded-md bg-emerald-50 px-3 py-2 text-emerald-900">
					The opening shows the {chatOpening.size} lines marked green; what follows fills "The rest of the real conversation". Check both before
					saving.
				</p>
			{/if}
		{:else if capture}
			<div class="flex flex-wrap items-center gap-2">
				<p class="flex-1">
					3. Tick the comments the opening shows; ticking a reply ticks what it answers. The rest is what the cast knows beyond it.
				</p>
				<Button type="button" variant="outline" class="min-h-11" onclick={() => chooseAll(true)}>Tick all</Button>
				<Button type="button" variant="outline" class="min-h-11" onclick={() => chooseAll(false)}>Clear</Button>
			</div>
			<div class="max-h-[32rem] overflow-y-auto rounded-md border p-1" role="group" aria-label="Captured comments">{@render thread("")}</div>
			<p role="status" class="rounded-md px-3 py-2 {chosen.size > LARGE_OPENING ? 'bg-amber-50 text-amber-900' : 'bg-muted'}">
				{chosen.size}
				of {capture.messages.length} comments in the opening{chosen.size > LARGE_OPENING ? ": a large opening makes every reply slower and costlier" : ""}.
			</p>
		{/if}
	</div>
</Accordion>
