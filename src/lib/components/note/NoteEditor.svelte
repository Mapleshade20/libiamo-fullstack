<script lang="ts">
import { USER_KEYWORDS_MAX_LENGTH, USER_TEXT_MAX_LENGTH } from "$lib/constants";

type Note = {
	id: number;
	tutorComment: string;
	keywords?: string[] | null;
	sourceContext?: string | null;
};

let {
	note,
	oncancel = () => {},
	onsave = async () => {},
}: {
	note: Note;
	oncancel?: () => void;
	onsave?: (data: { tutorComment: string; keywords: string[] }) => void | Promise<void>;
} = $props();

// svelte-ignore state_referenced_locally
let editTutorComment = $state(note.tutorComment);
// svelte-ignore state_referenced_locally
let editKeywords = $state((note.keywords ?? []).join(", "));
let isSaving = $state(false);
let error = $state<string | null>(null);

async function handleSubmit() {
	const tutorComment = editTutorComment.trim();
	if (!tutorComment || isSaving) return;

	isSaving = true;
	error = null;
	try {
		await onsave({
			tutorComment,
			keywords: editKeywords
				.split(",")
				.map((k) => k.trim())
				.filter(Boolean),
		});
	} catch (e) {
		console.error("Failed to save note:", e);
		error = e instanceof Error ? e.message : "Failed to save note";
	} finally {
		isSaving = false;
	}
}

function handleCancel() {
	editTutorComment = note.tutorComment;
	editKeywords = (note.keywords ?? []).join(", ");
	oncancel();
}
</script>

<form
	onsubmit={(e) => {
		e.preventDefault();
		void handleSubmit();
	}}
	class="rounded-lg border border-border bg-card p-4"
>
	<div class="space-y-3">
		<div>
			<label for="note-tutor-comment-{note.id}" class="mb-1 block text-xs font-semibold text-muted-foreground uppercase tracking-wide">Note</label>
			<textarea
				id="note-tutor-comment-{note.id}"
				bind:value={editTutorComment}
				maxlength={USER_TEXT_MAX_LENGTH}
				rows={4}
				class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
				required
			></textarea>
		</div>
		<div>
			<label for="note-keywords-{note.id}" class="mb-1 block text-xs font-semibold text-muted-foreground uppercase tracking-wide"
				>Keywords (comma-separated)</label
			>
			<input
				id="note-keywords-{note.id}"
				bind:value={editKeywords}
				maxlength={USER_KEYWORDS_MAX_LENGTH}
				class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
			>
		</div>
		{#if note.sourceContext}
			<p class="text-sm italic text-muted-foreground/70">{note.sourceContext}</p>
		{/if}
		{#if error}
			<p class="text-xs font-medium text-red-600">{error}</p>
		{/if}
		<div class="flex gap-2">
			<button
				type="submit"
				disabled={isSaving || !editTutorComment.trim()}
				class="rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background disabled:opacity-50"
			>
				{isSaving ? "Saving..." : "Save"}
			</button>
			<button type="button" onclick={handleCancel} class="rounded-md border border-border px-3 py-1.5 text-xs font-medium">Cancel</button>
		</div>
	</div>
</form>
