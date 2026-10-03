<script lang="ts">
import CalendarClock from "@lucide/svelte/icons/calendar-clock";
import LoaderCircle from "@lucide/svelte/icons/loader-circle";
import RotateCcw from "@lucide/svelte/icons/rotate-ccw";
import Save from "@lucide/svelte/icons/save";
import Trash2 from "@lucide/svelte/icons/trash-2";
import { deserialize } from "$app/forms";
import { invalidate } from "$app/navigation";
import { STREAK_DEPENDENCY } from "$lib/app/load-dependencies";
import { showValidationIssues } from "$lib/client/form-attention";
import ConfirmDialog from "$lib/components/common/ConfirmDialog.svelte";
import Field from "$lib/components/common/Field.svelte";
import Select from "$lib/components/common/Select.svelte";
import { Button } from "$lib/components/ui/button";
import { Input } from "$lib/components/ui/input";
import { Textarea } from "$lib/components/ui/textarea";
import type { LanguageCode } from "$lib/constants";
import { LANGUAGE_CODES, LANGUAGE_LABELS, REVIEW_MAXIMUM_INTERVAL_DAYS, USER_TEXT_MAX_LENGTH } from "$lib/constants";
import { t } from "$lib/i18n";
import type { ManagedNote } from "$lib/review/manage";
import { managedNoteSetDueSchema, managedNoteUpdateSchema } from "$lib/schemas/review";

let {
	note,
	lang,
	onupdate,
	ondelete,
}: {
	note: ManagedNote;
	lang: LanguageCode;
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
let confirmReset = $state(false);
let confirmDelete = $state(false);
let message = $state<{ tone: "success" | "error"; text: string } | null>(null);
let editorForm: HTMLFormElement;
let dueGroup: HTMLDivElement;

function formatDate(value: string) {
	return new Date(value).toLocaleString(lang, { dateStyle: "medium", timeStyle: "short" });
}

async function postAction(action: string, values: Record<string, string>) {
	const formData = new FormData();
	for (const [key, value] of Object.entries(values)) formData.set(key, value);
	const response = await fetch(`?/${action}`, { method: "POST", body: formData });
	const result = deserialize(await response.text());
	if (result.type !== "success") {
		throw new Error((result.type === "failure" ? (result.data?.error as string | undefined) : undefined) ?? "The action failed");
	}
	// Rescheduling or deleting can empty the review queue; the layout's snapshot of it is what
	// prompts the streak's empty-queue observation, and navigation no longer refreshes it.
	if (action !== "update") void invalidate(STREAK_DEPENDENCY);
	return result.data as Record<string, unknown>;
}

async function saveNote() {
	if (pending) return;
	const validation = managedNoteUpdateSchema.safeParse({ noteId: note.id, language, vocab, targetDefinition, nativeDefinition, examples });
	if (!validation.success) {
		showValidationIssues(editorForm, validation.error.issues);
		return;
	}
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
		message = { tone: "success", text: t(lang, "review.manage.cardSaved") };
	} catch (error) {
		message = { tone: "error", text: error instanceof Error ? error.message : t(lang, "review.manage.saveFailed") };
	} finally {
		pending = null;
	}
}

async function setDue() {
	if (pending) return;
	const validation = managedNoteSetDueSchema.safeParse({ noteId: note.id, days: dueDays });
	if (!validation.success) {
		showValidationIssues(dueGroup, validation.error.issues);
		return;
	}
	pending = "due";
	message = null;
	try {
		const data = await postAction("setDue", { noteId: String(note.id), days: String(dueDays) });
		const scheduling = data.scheduling as Pick<ManagedNote, "due" | "queueKind">;
		onupdate({ ...note, ...scheduling });
		message = { tone: "success", text: dueDays === 0 ? t(lang, "review.manage.dueNow") : `${t(lang, "review.manage.dueIn")} ${dueDays}` };
	} catch (error) {
		message = { tone: "error", text: error instanceof Error ? error.message : t(lang, "review.manage.dueFailed") };
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
		confirmReset = false;
		message = { tone: "success", text: t(lang, "review.manage.resetDone") };
	} catch (error) {
		message = { tone: "error", text: error instanceof Error ? error.message : t(lang, "review.manage.resetFailed") };
		confirmReset = false;
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
		confirmDelete = false;
		ondelete(note.id);
	} catch (error) {
		message = { tone: "error", text: error instanceof Error ? error.message : t(lang, "review.manage.deleteFailed") };
		confirmDelete = false;
		pending = null;
	}
}
</script>

<div class="overflow-hidden rounded-xl border border-border bg-card">
	<header class="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4 sm:px-6">
		<div class="min-w-0">
			<p class="text-xs text-muted-foreground">{t(lang, "review.manage.card")} #{note.id}</p>
			<h2 class="mt-0.5 text-2xl leading-tight">{note.vocab}</h2>
		</div>
		<div class="text-right text-xs leading-5 text-muted-foreground">
			<p>{t(lang, "review.manage.due")} {formatDate(note.due)}</p>
			<p>{note.reps} {t(lang, "review.manage.reviews")} · {note.lapses} {t(lang, "review.manage.lapses")}</p>
		</div>
	</header>

	<form
		bind:this={editorForm}
		tabindex="-1"
		data-validation-group
		class="space-y-5 px-5 py-5 outline-none sm:px-6"
		onsubmit={(event) => {
			event.preventDefault();
			void saveNote();
		}}
	>
		<div class="grid gap-4 sm:grid-cols-[10rem_1fr]">
			<Field label={t(lang, "review.manage.language")} for="note-{note.id}-language">
				<Select
					id="note-{note.id}-language"
					name="language"
					bind:value={language}
					items={LANGUAGE_CODES.map((code) => ({ value: code, label: LANGUAGE_LABELS[code] }))}
				/>
			</Field>
			<Field label={t(lang, "review.manage.vocabulary")} for="note-{note.id}-vocab">
				<Input id="note-{note.id}-vocab" name="vocab" bind:value={vocab} maxlength={USER_TEXT_MAX_LENGTH} required />
			</Field>
		</div>

		<div class="grid gap-4 sm:grid-cols-2">
			<Field label={t(lang, "review.manage.targetDefinition")} for="note-{note.id}-target-definition">
				<Textarea
					id="note-{note.id}-target-definition"
					name="targetDefinition"
					bind:value={targetDefinition}
					maxlength={USER_TEXT_MAX_LENGTH}
					rows={3}
					required
				/>
			</Field>
			<Field label={t(lang, "review.manage.nativeDefinition")} for="note-{note.id}-native-definition">
				<Textarea
					id="note-{note.id}-native-definition"
					name="nativeDefinition"
					bind:value={nativeDefinition}
					maxlength={USER_TEXT_MAX_LENGTH}
					rows={3}
					required
				/>
			</Field>
		</div>

		<fieldset class="space-y-3">
			<legend class="mb-1.5 text-sm font-medium">{t(lang, "review.manage.examples")}</legend>
			{#each examples as example, index}
				<div class="space-y-1.5">
					<p class="text-xs text-muted-foreground">{t(lang, "review.manage.example")} {index + 1}</p>
					<div class="grid gap-2 sm:grid-cols-2">
						<Textarea
							name={`examples.${index}.targetText`}
							bind:value={example.targetText}
							maxlength={USER_TEXT_MAX_LENGTH}
							rows={2}
							required
							aria-label={`${t(lang, "review.manage.targetExample")} ${index + 1}`}
							class="min-h-16"
						/>
						<Textarea
							name={`examples.${index}.nativeText`}
							bind:value={example.nativeText}
							maxlength={USER_TEXT_MAX_LENGTH}
							rows={2}
							required
							aria-label={`${t(lang, "review.manage.nativeExample")} ${index + 1}`}
							class="min-h-16"
						/>
					</div>
				</div>
			{/each}
		</fieldset>

		<div class="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
			<p class="min-h-5 text-sm {message?.tone === 'error' ? 'text-destructive' : 'text-success'}" role="status">{message?.text ?? ""}</p>
			<Button type="submit" disabled={pending !== null}>
				{#if pending === "save"}
					<LoaderCircle class="animate-spin motion-reduce:animate-none" aria-hidden="true" />
				{:else}
					<Save aria-hidden="true" />
				{/if}
				{t(lang, "review.manage.saveCard")}
			</Button>
		</div>
	</form>

	<section class="grid divide-y divide-border border-t border-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
		<div class="space-y-2 p-4 sm:p-5" data-field-container>
			<h3 class="flex items-center gap-2 text-sm font-medium"><CalendarClock size={16} aria-hidden="true" />{t(lang, "review.manage.setDue")}</h3>
			<p class="text-xs leading-relaxed text-muted-foreground">{t(lang, "review.manage.setDueDescription")}</p>
			<div class="flex gap-2 pt-1" bind:this={dueGroup}>
				<Input
					name="days"
					type="number"
					min="0"
					max={REVIEW_MAXIMUM_INTERVAL_DAYS}
					step="1"
					bind:value={dueDays}
					aria-label={t(lang, "review.manage.daysUntilDue")}
					class="h-8 flex-1 pointer-coarse:h-10"
				/>
				<Button variant="secondary" size="sm" disabled={pending !== null} onclick={() => { void setDue(); }}>
					{pending === "due" ? t(lang, "review.manage.setting") : t(lang, "review.manage.set")}
				</Button>
			</div>
		</div>

		<div class="space-y-2 p-4 sm:p-5">
			<h3 class="flex items-center gap-2 text-sm font-medium"><RotateCcw size={16} aria-hidden="true" />{t(lang, "review.manage.reset")}</h3>
			<p class="text-xs leading-relaxed text-muted-foreground">{t(lang, "review.manage.resetDescription")}</p>
			<div class="pt-1">
				<Button variant="secondary" size="sm" disabled={pending !== null} aria-haspopup="dialog" onclick={() => (confirmReset = true)}>
					{t(lang, "review.manage.resetCard")}
				</Button>
			</div>
		</div>

		<div class="space-y-2 p-4 sm:p-5">
			<h3 class="flex items-center gap-2 text-sm font-medium"><Trash2 size={16} aria-hidden="true" />{t(lang, "review.manage.delete")}</h3>
			<p class="text-xs leading-relaxed text-muted-foreground">{t(lang, "review.manage.cannotUndo")}</p>
			<div class="pt-1">
				<Button variant="destructive" size="sm" disabled={pending !== null} aria-haspopup="dialog" onclick={() => (confirmDelete = true)}>
					{t(lang, "review.manage.deleteCard")}
				</Button>
			</div>
		</div>
	</section>
</div>

<ConfirmDialog
	bind:open={confirmReset}
	tone="default"
	title={t(lang, "review.manage.resetCard")}
	message={t(lang, "review.manage.resetQuestion")}
	confirmLabel={pending === "reset" ? t(lang, "review.manage.resetting") : t(lang, "review.manage.confirm")}
	cancelLabel={t(lang, "common.cancel")}
	busy={pending === "reset"}
	onconfirm={() => void resetScheduling()}
/>
<ConfirmDialog
	bind:open={confirmDelete}
	title={t(lang, "review.manage.deleteCard")}
	message={t(lang, "review.manage.deleteQuestion")}
	confirmLabel={pending === "delete" ? t(lang, "review.manage.deleting") : t(lang, "common.delete")}
	cancelLabel={t(lang, "common.cancel")}
	busy={pending === "delete"}
	onconfirm={() => void deleteCard()}
/>
