<script lang="ts">
import Check from "@lucide/svelte/icons/check";
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
import Checkbox from "$lib/components/common/Checkbox.svelte";
import Notice from "$lib/components/common/Notice.svelte";
import { Badge } from "$lib/components/ui/badge";
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
	<ul class={parent ? "ml-4 border-l border-border pl-2" : "space-y-0.5"}>
		{#each replies.get(parent) ?? [] as message (message.id)}
			<li>
				<label
					class="flex min-h-11 cursor-pointer items-start gap-2.5 rounded-md px-2 py-1.5 transition-colors duration-100 {chosen.has(message.id) ? 'bg-foreground/[0.05]' : 'hover:bg-foreground/[0.025]'}"
				>
					<Checkbox class="mt-0.5" checked={chosen.has(message.id)} onchange={(event) => toggle(message, event.currentTarget.checked)} />
					<span class="min-w-0">
						<span class="font-medium">{message.author}</span>
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
					<Button type="button" variant="secondary" onclick={() => copyScript(platform)}>
						{#if copied === platform}
							<Check class="text-success" aria-hidden="true" />
						{/if}
						{copied === platform ? `${label} script copied` : `Copy the ${label} script`}
					</Button>
					<span class="text-xs text-muted-foreground">Run it {how}</span>
				</li>
			{/each}
		</ul>
		<div class="space-y-2">
			<Label for="capture">2. Paste what it copied</Label>
			<Textarea id="capture" rows={3} class="max-h-40" bind:value={pasted} />
			{#if parsed && !parsed.success}
				<p class="field-error-message" role="alert">{parsed.error}</p>
			{/if}
		</div>
		{#if capture?.platform === "discord"}
			<p>
				3. Choose where the learner joins: they take that person's place. The lines before it open the channel; what follows is what the cast knows
				beyond it.
			</p>
			<ol class="max-h-96 space-y-0.5 overflow-y-auto rounded-lg border border-border bg-white/50 p-1" aria-label="Captured messages">
				{#each capture.messages as message (message.id)}
					{@const parent = message.parent ? byId.get(message.parent) : undefined}
					<li>
						<button
							type="button"
							class="min-h-11 w-full cursor-pointer rounded-md border-l-[3px] px-2 py-1.5 text-left outline-none transition-colors duration-100 hover:bg-foreground/[0.025] focus-visible:ring-3 focus-visible:ring-ring/50 {message.id === joinedAt ? 'border-foreground bg-foreground/[0.06]' : chatOpening.has(message.id) ? 'border-foreground/30' : 'border-transparent'}"
							aria-pressed={message.id === joinedAt}
							onclick={() => join(message)}
						>
							{#if message.id === joinedAt}
								<Badge variant="default" class="mr-1">The learner joins here</Badge>
							{/if}
							<span class="font-medium">{message.author}</span>
							{#if parent}
								<span class="text-muted-foreground">↪ {parent.author}</span>
							{/if}
							<span class="line-clamp-2 text-muted-foreground">{message.text}</span>
						</button>
					</li>
				{/each}
			</ol>
			{#if joinedAt}
				<Notice tone="success" role="status">
					<p>
						The opening shows the {chatOpening.size} marked lines; what follows fills "The rest of the real conversation". Check both before saving.
					</p>
				</Notice>
			{/if}
		{:else if capture}
			<div class="flex flex-wrap items-center gap-2">
				<p class="flex-1">
					3. Tick the comments the opening shows; ticking a reply ticks what it answers. The rest is what the cast knows beyond it.
				</p>
				<Button type="button" variant="secondary" size="sm" onclick={() => chooseAll(true)}>Tick all</Button>
				<Button type="button" variant="ghost" size="sm" onclick={() => chooseAll(false)}>Clear</Button>
			</div>
			<div class="max-h-[32rem] overflow-y-auto rounded-lg border border-border bg-white/50 p-1" role="group" aria-label="Captured comments">
				{@render thread("")}
			</div>
			<Notice tone={chosen.size > LARGE_OPENING ? "warning" : "info"} role="status">
				<p>
					{chosen.size}
					of {capture.messages.length} comments in the opening{chosen.size > LARGE_OPENING ? ": a large opening makes every reply slower and costlier" : ""}.
				</p>
			</Notice>
		{/if}
	</div>
</Accordion>
