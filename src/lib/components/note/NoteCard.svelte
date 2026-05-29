<script lang="ts">
import Bookmark from "@lucide/svelte/icons/bookmark";
import LoaderCircle from "@lucide/svelte/icons/loader-circle";
import MessageCircleQuestion from "@lucide/svelte/icons/message-circle-question";
import Pencil from "@lucide/svelte/icons/pencil";
import Trash2 from "@lucide/svelte/icons/trash-2";
import X from "@lucide/svelte/icons/x";
import { browser } from "$app/environment";
import { deserialize } from "$app/forms";

type Note = {
	id: number;
	tutorComment: string;
	keywords?: string[] | null;
	sourceContext?: string | null;
};

let {
	note,
	hasReviewCard = true,
	creating = false,
	onedit = () => {},
	ondelete = () => {},
	oncreateCard = () => {},
	t = {} as Record<string, string>,
}: {
	note: Note;
	hasReviewCard?: boolean;
	creating?: boolean;
	onedit?: () => void;
	ondelete?: () => void;
	oncreateCard?: () => void;
	t?: Record<string, string>;
} = $props();

let askOpen = $state(false);
let askQuestion = $state("");
let askAnswer = $state<string | null>(null);
let askLoading = $state(false);
let askError = $state<string | null>(null);

function toggleAsk() {
	askOpen = !askOpen;
	askQuestion = "";
	askAnswer = null;
	askError = null;
}

async function submitAsk(q: string) {
	if (askLoading || !browser) return;
	askLoading = true;
	askAnswer = null;
	askError = null;
	try {
		const formData = new FormData();
		formData.append("noteId", String(note.id));
		formData.append("question", q);
		const res = await fetch("?/followUp", { method: "POST", body: formData });
		const result = deserialize(await res.text());
		if (result.type === "success" && result.data) {
			askAnswer = (result.data as { answer?: string }).answer ?? null;
		} else {
			askError = (result.type === "failure" ? (result.data?.error as string | undefined) : undefined) ?? "Failed to get answer";
		}
	} catch (e) {
		console.error("Follow-up failed:", e);
		askError = "Network error";
	} finally {
		askLoading = false;
	}
}
</script>

<div class="rounded-lg border border-border bg-card p-4">
	<div class="flex items-start gap-3">
		<div class="min-w-0 flex-1">
			<p class="text-sm text-muted-foreground leading-relaxed">{note.tutorComment}</p>
			{#if note.sourceContext}
				<p class="mt-1 text-xs text-muted-foreground/40 italic line-clamp-3">{note.sourceContext}</p>
			{/if}
			{#if note.keywords && note.keywords.length > 0}
				<div class="mt-3 flex flex-wrap gap-1">
					{#each note.keywords as kw}
						<span class="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{kw}</span>
					{/each}
				</div>
			{/if}
		</div>
		<div class="shrink-0 flex flex-col items-center gap-0.5">
			<button type="button" class="rounded p-1 text-muted-foreground hover:text-foreground transition-colors" onclick={onedit} title="Edit">
				<Pencil size={14} />
			</button>
			<button type="button" class="rounded p-1 text-muted-foreground hover:text-red-600 transition-colors" onclick={ondelete} title="Delete">
				<Trash2 size={14} />
			</button>
			{#if !hasReviewCard}
				<button
					type="button"
					class="rounded p-1 text-muted-foreground hover:text-foreground transition-colors"
					onclick={oncreateCard}
					disabled={creating}
					title="Create review card"
				>
					{#if creating}
						<LoaderCircle size={14} class="animate-spin" />
					{:else}
						<Bookmark size={14} />
					{/if}
				</button>
			{/if}
			<button
				type="button"
				class="rounded p-1 text-muted-foreground hover:text-foreground transition-colors"
				onclick={toggleAsk}
				title={t.askFollowUp ?? "Ask about this"}
			>
				<MessageCircleQuestion size={14} />
			</button>
		</div>
	</div>

	{#if askOpen}
		<div class="mt-3 rounded-md border border-border bg-muted/40 p-3">
			{#if askAnswer}
				<div class="flex items-start gap-2">
					<p class="flex-1 whitespace-pre-wrap text-sm leading-relaxed text-foreground">{askAnswer}</p>
					<button type="button" class="mt-0.5 text-muted-foreground hover:text-foreground" onclick={toggleAsk} title="Dismiss">
						<X size={14} />
					</button>
				</div>
			{:else}
				{#if askError}
					<p class="mb-2 text-xs text-red-600">{askError}</p>
				{/if}
				<div class="mb-2 flex flex-wrap gap-1.5">
					<button type="button" class="rounded-full bg-background px-2.5 py-1 text-xs hover:bg-background/80" onclick={() => submitAsk("why")}>
						{t.askWhy ?? "Why is this wrong?"}
					</button>
					<button type="button" class="rounded-full bg-background px-2.5 py-1 text-xs hover:bg-background/80" onclick={() => submitAsk("examples")}>
						{t.askExamples ?? "Give me more examples"}
					</button>
				</div>
				<form
					class="flex gap-1.5"
					onsubmit={(e) => {
						e.preventDefault();
						const q = askQuestion.trim();
						if (q) submitAsk(q);
					}}
				>
					<input
						type="text"
						class="min-w-0 flex-1 rounded-md border border-border bg-background px-2.5 py-1 text-xs"
						placeholder={t.askPlaceholder ?? "Ask a follow-up question..."}
						bind:value={askQuestion}
						disabled={askLoading}
					>
					<button
						type="submit"
						class="rounded-md bg-foreground px-2.5 py-1 text-xs font-medium text-background disabled:opacity-40"
						disabled={askLoading || !askQuestion.trim()}
					>
						{#if askLoading}
							<LoaderCircle size={14} class="animate-spin" />
						{:else}
							{t.askSubmit ?? "Ask"}
						{/if}
					</button>
				</form>
			{/if}
		</div>
	{/if}
</div>
