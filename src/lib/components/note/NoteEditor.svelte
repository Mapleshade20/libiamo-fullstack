<script lang="ts">
import { USER_TEXT_MAX_LENGTH } from "$lib/constants";

type Note = {
	id: number;
	vocab: string;
	targetDefinition: string;
	nativeDefinition: string;
};

let {
	note,
	oncancel = () => {},
	onsave = async () => {},
}: {
	note: Note;
	oncancel?: () => void;
	onsave?: (data: { vocab: string; targetDefinition: string; nativeDefinition: string }) => void | Promise<void>;
} = $props();

// svelte-ignore state_referenced_locally
let editVocab = $state(note.vocab);
// svelte-ignore state_referenced_locally
let editTargetDefinition = $state(note.targetDefinition);
// svelte-ignore state_referenced_locally
let editNativeDefinition = $state(note.nativeDefinition);
let isSaving = $state(false);
let error = $state<string | null>(null);

async function handleSubmit() {
	const vocab = editVocab.trim();
	const targetDefinition = editTargetDefinition.trim();
	const nativeDefinition = editNativeDefinition.trim();
	if (!vocab || !targetDefinition || !nativeDefinition || isSaving) return;

	isSaving = true;
	error = null;
	try {
		await onsave({ vocab, targetDefinition, nativeDefinition });
	} catch (e) {
		console.error("Failed to save note:", e);
		error = e instanceof Error ? e.message : "Failed to save note";
	} finally {
		isSaving = false;
	}
}

function handleCancel() {
	editVocab = note.vocab;
	editTargetDefinition = note.targetDefinition;
	editNativeDefinition = note.nativeDefinition;
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
			<label for="note-vocab-{note.id}" class="mb-1 block text-xs font-semibold text-muted-foreground uppercase tracking-wide">Vocabulary</label>
			<input
				id="note-vocab-{note.id}"
				bind:value={editVocab}
				maxlength={USER_TEXT_MAX_LENGTH}
				class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
				required
			>
		</div>
		<div>
			<label for="note-native-definition-{note.id}" class="mb-1 block text-xs font-semibold text-muted-foreground uppercase tracking-wide"
				>Native-language definition</label
			>
			<textarea
				id="note-native-definition-{note.id}"
				bind:value={editNativeDefinition}
				maxlength={USER_TEXT_MAX_LENGTH}
				rows={4}
				class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
				required
			></textarea>
		</div>
		<div>
			<label for="note-target-definition-{note.id}" class="mb-1 block text-xs font-semibold text-muted-foreground uppercase tracking-wide"
				>Target-language definition</label
			>
			<textarea
				id="note-target-definition-{note.id}"
				bind:value={editTargetDefinition}
				maxlength={USER_TEXT_MAX_LENGTH}
				rows={4}
				class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
				required
			></textarea>
		</div>
		{#if error}
			<p class="text-xs font-medium text-red-600">{error}</p>
		{/if}
		<div class="flex gap-2">
			<button
				type="submit"
				disabled={isSaving || !editVocab.trim() || !editTargetDefinition.trim() || !editNativeDefinition.trim()}
				class="rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background disabled:opacity-50"
			>
				{isSaving ? "Saving..." : "Save"}
			</button>
			<button type="button" onclick={handleCancel} class="rounded-md border border-border px-3 py-1.5 text-xs font-medium">Cancel</button>
		</div>
	</div>
</form>
