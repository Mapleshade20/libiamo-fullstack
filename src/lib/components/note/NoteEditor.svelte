<script lang="ts">
import { enhance } from "$app/forms";

type Note = {
	id: number;
	tutorComment: string;
	keywords?: string[] | null;
	sourceContext?: string | null;
};

let {
	note,
	action = "?/update",
	oncancel = () => {},
	onsaved = () => {},
}: {
	note: Note;
	action?: string;
	oncancel?: () => void;
	onsaved?: () => void;
} = $props();

// svelte-ignore state_referenced_locally
let editTutorComment = $state(note.tutorComment);
// svelte-ignore state_referenced_locally
let editKeywords = $state((note.keywords ?? []).join(", "));
let isEditing = $state(false);
</script>

<form
	method="POST"
	{action}
	use:enhance={() => {
		isEditing = true;
		return async ({ result }) => {
			isEditing = false;
			if (result.type === "success") onsaved();
		};
	}}
	class="rounded-lg border border-border bg-card p-4"
>
	<input type="hidden" name="noteId" value={note.id}>
	<div class="space-y-3">
		<div>
			<label for="note-tutor-comment" class="mb-1 block text-xs font-semibold text-muted-foreground uppercase tracking-wide">Note</label>
			<textarea
				id="note-tutor-comment"
				bind:value={editTutorComment}
				name="tutorComment"
				rows={4}
				class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
				required
			></textarea>
		</div>
		<div>
			<label for="note-keywords" class="mb-1 block text-xs font-semibold text-muted-foreground uppercase tracking-wide"
				>Keywords (comma-separated)</label
			>
			<input
				id="note-keywords"
				bind:value={editKeywords}
				name="keywords"
				class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
			>
		</div>
		{#if note.sourceContext}
			<p class="text-xs italic text-muted-foreground/60">{note.sourceContext}</p>
		{/if}
		<div class="flex gap-2">
			<button type="submit" disabled={isEditing} class="rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background disabled:opacity-50">
				{isEditing ? "Saving..." : "Save"}
			</button>
			<button
				type="button"
				onclick={() => {
					editTutorComment = note.tutorComment;
					editKeywords = (note.keywords ?? []).join(", ");
					oncancel();
				}}
				class="rounded-md border border-border px-3 py-1.5 text-xs font-medium"
			>
				Cancel
			</button>
		</div>
	</div>
</form>
