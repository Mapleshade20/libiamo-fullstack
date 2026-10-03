<script lang="ts">
import LoaderCircle from "@lucide/svelte/icons/loader-circle";
import MessageCircleQuestion from "@lucide/svelte/icons/message-circle-question";
import Trash2 from "@lucide/svelte/icons/trash-2";
import X from "@lucide/svelte/icons/x";
import { browser } from "$app/environment";
import { deserialize } from "$app/forms";
import { refreshTrialQuota } from "$lib/components/account/trial-quota";
import { Button } from "$lib/components/ui/button";
import { Input } from "$lib/components/ui/input";
import { USER_TEXT_MAX_LENGTH } from "$lib/constants";

type Note = {
	id: number;
	vocab: string;
	targetDefinition: string;
	nativeDefinition: string;
};

let {
	note,
	ondelete = () => {},
	t = {} as Record<string, string>,
}: {
	note: Note;
	ondelete?: () => void;
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
		void refreshTrialQuota();
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

<div class="rounded-xl border border-border bg-card p-4">
	<div class="flex flex-col sm:flex-row sm:items-start gap-3">
		<div class="min-w-0 flex-1">
			<h3 class="font-prose text-base leading-snug font-medium">{note.vocab}</h3>
			<p class="mt-2 font-prose text-sm leading-relaxed text-foreground/80">{note.nativeDefinition}</p>
			<p class="mt-1 font-prose text-xs leading-relaxed text-muted-foreground">{note.targetDefinition}</p>
		</div>
		<div class="shrink-0 flex flex-row sm:flex-col items-center gap-0.5">
			<Button
				variant="ghost"
				size="icon-sm"
				class="text-muted-foreground hover:text-destructive"
				onclick={ondelete}
				title="Delete"
				aria-label="Delete"
			>
				<Trash2 aria-hidden="true" />
			</Button>
			<Button
				variant="ghost"
				size="icon-sm"
				class="text-muted-foreground"
				onclick={toggleAsk}
				aria-expanded={askOpen}
				title={t.askFollowUp ?? "Ask about this"}
				aria-label={t.askFollowUp ?? "Ask about this"}
			>
				<MessageCircleQuestion aria-hidden="true" />
			</Button>
		</div>
	</div>

	{#if askOpen}
		<div class="mt-3 rounded-lg bg-foreground/[0.04] p-3">
			{#if askAnswer}
				<div class="flex items-start gap-2">
					<p class="flex-1 whitespace-pre-wrap font-prose text-sm leading-relaxed text-foreground">{askAnswer}</p>
					<Button variant="ghost" size="icon-sm" class="-mt-1 -mr-1 text-muted-foreground" onclick={toggleAsk} title="Dismiss" aria-label="Dismiss">
						<X aria-hidden="true" />
					</Button>
				</div>
			{:else}
				{#if askError}
					<p class="mb-2 text-xs text-destructive">{askError}</p>
				{/if}
				<div class="mb-2 flex flex-wrap gap-1.5">
					<Button variant="secondary" size="sm" class="rounded-full" onclick={() => submitAsk("why")}> {t.askWhy ?? "Why is this wrong?"} </Button>
					<Button variant="secondary" size="sm" class="rounded-full" onclick={() => submitAsk("examples")}>
						{t.askExamples ?? "Give me more examples"}
					</Button>
				</div>
				<form
					class="flex gap-1.5"
					onsubmit={(e) => {
						e.preventDefault();
						const q = askQuestion.trim();
						if (q) submitAsk(q);
					}}
				>
					<Input
						class="h-8 flex-1 pointer-coarse:h-10"
						placeholder={t.askPlaceholder ?? "Ask a follow-up question…"}
						aria-label={t.askFollowUp ?? "Ask about this"}
						bind:value={askQuestion}
						maxlength={USER_TEXT_MAX_LENGTH}
						disabled={askLoading}
					/>
					<Button type="submit" size="sm" disabled={askLoading || !askQuestion.trim()}>
						{#if askLoading}
							<LoaderCircle class="animate-spin motion-reduce:animate-none" aria-hidden="true" />
						{:else}
							{t.askSubmit ?? "Ask"}
						{/if}
					</Button>
				</form>
			{/if}
		</div>
	{/if}
</div>
