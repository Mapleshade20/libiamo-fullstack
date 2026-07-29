<script lang="ts">
import CalendarClock from "@lucide/svelte/icons/calendar-clock";
import LoaderCircle from "@lucide/svelte/icons/loader-circle";
import RotateCcw from "@lucide/svelte/icons/rotate-ccw";
import Save from "@lucide/svelte/icons/save";
import Trash2 from "@lucide/svelte/icons/trash-2";
import { deserialize } from "$app/forms";
import { LANGUAGE_CODES, LANGUAGE_LABELS, REVIEW_MAXIMUM_INTERVAL_DAYS, USER_TEXT_MAX_LENGTH } from "$lib/constants";
import type { ManagedNote } from "$lib/note-management";

let {
	note,
	onupdate,
	ondelete,
}: {
	note: ManagedNote;
	onupdate: (note: ManagedNote) => void;
	ondelete: (noteId: number) => void;
} = $props();

// svelte-ignore state_referenced_locally
let language = $state(note.language);
// svelte-ignore state_referenced_locally
let vocab = $state(note.vocab);
// svelte-ignore state_referenced_locally
let targetDefinition = $state(note.targetDefinition);
// svelte-ignore state_referenced_locally
let nativeDefinition = $state(note.nativeDefinition);
// svelte-ignore state_referenced_locally
let examples = $state(note.examples.map((example) => ({ ...example })));
let dueDays = $state(0);
let pending = $state<"save" | "due" | "reset" | "delete" | null>(null);
let confirmAction = $state<"reset" | "delete" | null>(null);
let message = $state<{ tone: "success" | "error"; text: string } | null>(null);

function formatDate(value: string) {
	return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

async function postAction(action: string, values: Record<string, string>) {
	const formData = new FormData();
	for (const [key, value] of Object.entries(values)) formData.set(key, value);
	const response = await fetch(`?/${action}`, { method: "POST", body: formData });
	const result = deserialize(await response.text());
	if (result.type !== "success") {
		throw new Error((result.type === "failure" ? (result.data?.error as string | undefined) : undefined) ?? "The action failed");
	}
	return result.data as Record<string, unknown>;
}

async function saveNote() {
	if (pending) return;
	pending = "save";
	message = null;
	try {
		const data = await postAction("update", {
			noteId: String(note.id),
			language,
			vocab,
			targetDefinition,
			nativeDefinition,
			examples: JSON.stringify(examples),
		});
		const updated = data.note as ManagedNote;
		onupdate(updated);
		message = { tone: "success", text: "Card saved." };
	} catch (error) {
		message = { tone: "error", text: error instanceof Error ? error.message : "Failed to save card" };
	} finally {
		pending = null;
	}
}

async function setDue() {
	if (pending) return;
	pending = "due";
	message = null;
	try {
		const data = await postAction("setDue", { noteId: String(note.id), days: String(dueDays) });
		const scheduling = data.scheduling as Pick<ManagedNote, "due" | "queueKind">;
		onupdate({ ...note, ...scheduling });
		message = { tone: "success", text: dueDays === 0 ? "Card is due now." : `Card is due in ${dueDays} day${dueDays === 1 ? "" : "s"}.` };
	} catch (error) {
		message = { tone: "error", text: error instanceof Error ? error.message : "Failed to set due date" };
	} finally {
		pending = null;
	}
}

async function resetScheduling() {
	if (pending) return;
	pending = "reset";
	message = null;
	try {
		const data = await postAction("reset", { noteId: String(note.id) });
		const scheduling = data.scheduling as Pick<ManagedNote, "due" | "queueKind" | "reps" | "lapses">;
		onupdate({ ...note, ...scheduling });
		confirmAction = null;
		message = { tone: "success", text: "Scheduling and review history reset." };
	} catch (error) {
		message = { tone: "error", text: error instanceof Error ? error.message : "Failed to reset card" };
	} finally {
		pending = null;
	}
}

async function deleteCard() {
	if (pending) return;
	pending = "delete";
	message = null;
	try {
		await postAction("delete", { noteId: String(note.id) });
		ondelete(note.id);
	} catch (error) {
		message = { tone: "error", text: error instanceof Error ? error.message : "Failed to delete card" };
		pending = null;
	}
}
</script>

<div class="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_22px_60px_-48px_rgba(40,32,24,0.7)]">
	<header class="border-b border-border bg-stone-100/45 px-5 py-4 sm:px-6">
		<div class="flex flex-wrap items-start justify-between gap-3">
			<div>
				<p class="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Card #{note.id}</p>
				<h2 class="mt-1 font-serif text-2xl leading-tight">{note.vocab}</h2>
			</div>
			<div class="text-right text-xs leading-5 text-muted-foreground">
				<p>Due {formatDate(note.due)}</p>
				<p>{note.reps} reviews · {note.lapses} lapses</p>
			</div>
		</div>
	</header>

	<form
		class="space-y-5 px-5 py-5 sm:px-6"
		onsubmit={(event) => {
			event.preventDefault();
			void saveNote();
		}}
	>
		<div class="grid gap-4 sm:grid-cols-[9rem_1fr]">
			<label class="space-y-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
				Language
				<select
					bind:value={language}
					class="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm font-normal normal-case tracking-normal text-foreground"
				>
					{#each LANGUAGE_CODES as code}
						<option value={code}>{LANGUAGE_LABELS[code]}</option>
					{/each}
				</select>
			</label>
			<label class="space-y-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
				Vocabulary
				<input
					bind:value={vocab}
					maxlength={USER_TEXT_MAX_LENGTH}
					required
					class="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 text-base font-normal normal-case tracking-normal text-foreground"
				>
			</label>
		</div>

		<div class="grid gap-4 sm:grid-cols-2">
			<label class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
				Target-language definition
				<textarea
					bind:value={targetDefinition}
					maxlength={USER_TEXT_MAX_LENGTH}
					rows={4}
					required
					class="mt-1.5 w-full resize-y rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-normal normal-case leading-relaxed tracking-normal text-foreground"
				></textarea>
			</label>
			<label class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
				Native-language definition
				<textarea
					bind:value={nativeDefinition}
					maxlength={USER_TEXT_MAX_LENGTH}
					rows={4}
					required
					class="mt-1.5 w-full resize-y rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-normal normal-case leading-relaxed tracking-normal text-foreground"
				></textarea>
			</label>
		</div>

		<fieldset class="space-y-3">
			<legend class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Bilingual examples</legend>
			{#each examples as example, index}
				<div class="rounded-xl border border-border/80 bg-stone-50/55 p-3">
					<p class="mb-2 font-serif text-xs italic text-muted-foreground">Example {index + 1}</p>
					<div class="grid gap-2 sm:grid-cols-2">
						<textarea
							bind:value={example.targetText}
							maxlength={USER_TEXT_MAX_LENGTH}
							rows={2}
							required
							aria-label="Target-language example {index + 1}"
							class="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm leading-relaxed"
						></textarea>
						<textarea
							bind:value={example.nativeText}
							maxlength={USER_TEXT_MAX_LENGTH}
							rows={2}
							required
							aria-label="Native-language example {index + 1}"
							class="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm leading-relaxed"
						></textarea>
					</div>
				</div>
			{/each}
		</fieldset>

		<div class="flex items-center justify-between gap-4 border-t border-border pt-4">
			<p class="min-h-5 text-sm {message?.tone === 'error' ? 'text-red-700' : 'text-emerald-700'}" role="status">{message?.text ?? ""}</p>
			<button
				type="submit"
				disabled={pending !== null}
				class="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg bg-foreground px-4 text-sm font-medium text-background transition-opacity hover:opacity-85 disabled:opacity-45"
			>
				{#if pending === "save"}
					<LoaderCircle class="animate-spin" size={15} />
				{:else}
					<Save size={15} />
				{/if}
				Save card
			</button>
		</div>
	</form>

	<section class="grid border-t border-border bg-stone-100/35 sm:grid-cols-3 sm:divide-x sm:divide-border">
		<div class="space-y-3 p-4">
			<div class="flex items-center gap-2 text-sm font-semibold"><CalendarClock size={16} />Set due</div>
			<p class="text-xs leading-relaxed text-muted-foreground">Keep the FSRS state and move the due time by a number of days from now.</p>
			<div class="flex gap-2">
				<input
					type="number"
					min="0"
					max={REVIEW_MAXIMUM_INTERVAL_DAYS}
					step="1"
					bind:value={dueDays}
					aria-label="Days until due"
					class="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-sm"
				>
				<button
					type="button"
					disabled={pending !== null}
					onclick={() => { void setDue(); }}
					class="h-8 rounded-md border border-border bg-background px-3 text-xs font-semibold hover:bg-secondary disabled:opacity-45"
				>
					{pending === "due" ? "Setting…" : "Set"}
				</button>
			</div>
		</div>

		<div class="space-y-3 p-4">
			<div class="flex items-center gap-2 text-sm font-semibold"><RotateCcw size={16} />Reset</div>
			{#if confirmAction === "reset"}
				<p class="text-xs leading-relaxed text-amber-800">Return this card to New and erase its review history?</p>
				<div class="flex gap-2">
					<button
						type="button"
						disabled={pending !== null}
						onclick={() => { void resetScheduling(); }}
						class="h-8 rounded-md bg-amber-700 px-3 text-xs font-semibold text-white disabled:opacity-45"
					>
						{pending === "reset" ? "Resetting…" : "Confirm"}
					</button>
					<button type="button" onclick={() => { confirmAction = null; }} class="h-8 rounded-md border border-border px-3 text-xs">Cancel</button>
				</div>
			{:else}
				<p class="text-xs leading-relaxed text-muted-foreground">Start over as a New card and clear all review logs.</p>
				<button
					type="button"
					onclick={() => { confirmAction = "reset"; }}
					class="h-8 rounded-md border border-border bg-background px-3 text-xs font-semibold hover:bg-secondary"
				>
					Reset card
				</button>
			{/if}
		</div>

		<div class="space-y-3 p-4">
			<div class="flex items-center gap-2 text-sm font-semibold text-red-800"><Trash2 size={16} />Delete</div>
			{#if confirmAction === "delete"}
				<p class="text-xs leading-relaxed text-red-800">Permanently delete this card and its review history?</p>
				<div class="flex gap-2">
					<button
						type="button"
						disabled={pending !== null}
						onclick={() => { void deleteCard(); }}
						class="h-8 rounded-md bg-red-700 px-3 text-xs font-semibold text-white disabled:opacity-45"
					>
						{pending === "delete" ? "Deleting…" : "Delete"}
					</button>
					<button type="button" onclick={() => { confirmAction = null; }} class="h-8 rounded-md border border-border px-3 text-xs">Cancel</button>
				</div>
			{:else}
				<p class="text-xs leading-relaxed text-muted-foreground">This cannot be undone.</p>
				<button
					type="button"
					onclick={() => { confirmAction = "delete"; }}
					class="h-8 rounded-md border border-red-200 bg-red-50 px-3 text-xs font-semibold text-red-800 hover:bg-red-100"
				>
					Delete card
				</button>
			{/if}
		</div>
	</section>
</div>
