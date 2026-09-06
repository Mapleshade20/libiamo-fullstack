<script lang="ts">
import CalendarClock from "@lucide/svelte/icons/calendar-clock";
import LoaderCircle from "@lucide/svelte/icons/loader-circle";
import RotateCcw from "@lucide/svelte/icons/rotate-ccw";
import Save from "@lucide/svelte/icons/save";
import Trash2 from "@lucide/svelte/icons/trash-2";
import { deserialize } from "$app/forms";
import type { LanguageCode } from "$lib/constants";
import { LANGUAGE_CODES, LANGUAGE_LABELS, REVIEW_MAXIMUM_INTERVAL_DAYS, USER_TEXT_MAX_LENGTH } from "$lib/constants";
import { t } from "$lib/i18n";
import type { ManagedNote } from "$lib/note-management";

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
let confirmAction = $state<"reset" | "delete" | null>(null);
let message = $state<{ tone: "success" | "error"; text: string } | null>(null);

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
		message = { tone: "success", text: t(lang, "review.manage.cardSaved") };
	} catch (error) {
		message = { tone: "error", text: error instanceof Error ? error.message : t(lang, "review.manage.saveFailed") };
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
		confirmAction = null;
		message = { tone: "success", text: t(lang, "review.manage.resetDone") };
	} catch (error) {
		message = { tone: "error", text: error instanceof Error ? error.message : t(lang, "review.manage.resetFailed") };
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
		message = { tone: "error", text: error instanceof Error ? error.message : t(lang, "review.manage.deleteFailed") };
		pending = null;
	}
}
</script>

<div class="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_22px_60px_-48px_rgba(40,32,24,0.7)]">
	<header class="border-b border-border bg-stone-100/45 px-5 py-4 sm:px-6">
		<div class="flex flex-wrap items-start justify-between gap-3">
			<div>
				<p class="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">{t(lang, "review.manage.card")} #{note.id}</p>
				<h2 class="mt-1 font-serif text-2xl leading-tight">{note.vocab}</h2>
			</div>
			<div class="text-right text-xs leading-5 text-muted-foreground">
				<p>{t(lang, "review.manage.due")} {formatDate(note.due)}</p>
				<p>{note.reps} {t(lang, "review.manage.reviews")} · {note.lapses} {t(lang, "review.manage.lapses")}</p>
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
				{t(lang, "review.manage.language")}
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
				{t(lang, "review.manage.vocabulary")}
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
				{t(lang, "review.manage.targetDefinition")}
				<textarea
					bind:value={targetDefinition}
					maxlength={USER_TEXT_MAX_LENGTH}
					rows={4}
					required
					class="mt-1.5 w-full resize-y rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-normal normal-case leading-relaxed tracking-normal text-foreground"
				></textarea>
			</label>
			<label class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
				{t(lang, "review.manage.nativeDefinition")}
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
			<legend class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t(lang, "review.manage.examples")}</legend>
			{#each examples as example, index}
				<div class="rounded-xl border border-border/80 bg-stone-50/55 p-3">
					<p class="mb-2 font-serif text-xs italic text-muted-foreground">{t(lang, "review.manage.example")} {index + 1}</p>
					<div class="grid gap-2 sm:grid-cols-2">
						<textarea
							bind:value={example.targetText}
							maxlength={USER_TEXT_MAX_LENGTH}
							rows={2}
							required
							aria-label={`${t(lang, "review.manage.targetExample")} ${index + 1}`}
							class="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm leading-relaxed"
						></textarea>
						<textarea
							bind:value={example.nativeText}
							maxlength={USER_TEXT_MAX_LENGTH}
							rows={2}
							required
							aria-label={`${t(lang, "review.manage.nativeExample")} ${index + 1}`}
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
				{t(lang, "review.manage.saveCard")}
			</button>
		</div>
	</form>

	<section class="grid border-t border-border bg-stone-100/35 sm:grid-cols-3 sm:divide-x sm:divide-border">
		<div class="space-y-3 p-4">
			<div class="flex items-center gap-2 text-sm font-semibold"><CalendarClock size={16} />{t(lang, "review.manage.setDue")}</div>
			<p class="text-xs leading-relaxed text-muted-foreground">{t(lang, "review.manage.setDueDescription")}</p>
			<div class="flex gap-2">
				<input
					type="number"
					min="0"
					max={REVIEW_MAXIMUM_INTERVAL_DAYS}
					step="1"
					bind:value={dueDays}
					aria-label={t(lang, "review.manage.daysUntilDue")}
					class="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-sm"
				>
				<button
					type="button"
					disabled={pending !== null}
					onclick={() => { void setDue(); }}
					class="h-8 rounded-md border border-border bg-background px-3 text-xs font-semibold hover:bg-secondary disabled:opacity-45"
				>
					{pending === "due" ? t(lang, "review.manage.setting") : t(lang, "review.manage.set")}
				</button>
			</div>
		</div>

		<div class="space-y-3 p-4">
			<div class="flex items-center gap-2 text-sm font-semibold"><RotateCcw size={16} />{t(lang, "review.manage.reset")}</div>
			{#if confirmAction === "reset"}
				<p class="text-xs leading-relaxed text-amber-800">{t(lang, "review.manage.resetQuestion")}</p>
				<div class="flex gap-2">
					<button
						type="button"
						disabled={pending !== null}
						onclick={() => { void resetScheduling(); }}
						class="h-8 rounded-md bg-amber-700 px-3 text-xs font-semibold text-white disabled:opacity-45"
					>
						{pending === "reset" ? t(lang, "review.manage.resetting") : t(lang, "review.manage.confirm")}
					</button>
					<button type="button" onclick={() => { confirmAction = null; }} class="h-8 rounded-md border border-border px-3 text-xs">
						{t(lang, "common.cancel")}
					</button>
				</div>
			{:else}
				<p class="text-xs leading-relaxed text-muted-foreground">{t(lang, "review.manage.resetDescription")}</p>
				<button
					type="button"
					onclick={() => { confirmAction = "reset"; }}
					class="h-8 rounded-md border border-border bg-background px-3 text-xs font-semibold hover:bg-secondary"
				>
					{t(lang, "review.manage.resetCard")}
				</button>
			{/if}
		</div>

		<div class="space-y-3 p-4">
			<div class="flex items-center gap-2 text-sm font-semibold text-red-800"><Trash2 size={16} />{t(lang, "review.manage.delete")}</div>
			{#if confirmAction === "delete"}
				<p class="text-xs leading-relaxed text-red-800">{t(lang, "review.manage.deleteQuestion")}</p>
				<div class="flex gap-2">
					<button
						type="button"
						disabled={pending !== null}
						onclick={() => { void deleteCard(); }}
						class="h-8 rounded-md bg-red-700 px-3 text-xs font-semibold text-white disabled:opacity-45"
					>
						{pending === "delete" ? t(lang, "review.manage.deleting") : t(lang, "common.delete")}
					</button>
					<button type="button" onclick={() => { confirmAction = null; }} class="h-8 rounded-md border border-border px-3 text-xs">
						{t(lang, "common.cancel")}
					</button>
				</div>
			{:else}
				<p class="text-xs leading-relaxed text-muted-foreground">{t(lang, "review.manage.cannotUndo")}</p>
				<button
					type="button"
					onclick={() => { confirmAction = "delete"; }}
					class="h-8 rounded-md border border-red-200 bg-red-50 px-3 text-xs font-semibold text-red-800 hover:bg-red-100"
				>
					{t(lang, "review.manage.deleteCard")}
				</button>
			{/if}
		</div>
	</section>
</div>
