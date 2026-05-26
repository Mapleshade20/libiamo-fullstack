<script lang="ts">
import BookOpen from "@lucide/svelte/icons/book-open";
import ChevronRight from "@lucide/svelte/icons/chevron-right";
import Mail from "@lucide/svelte/icons/mail";
import MessageCircle from "@lucide/svelte/icons/message-circle";
import MessageSquare from "@lucide/svelte/icons/message-square";
import type { Component } from "svelte";
import NoteCard from "$lib/components/note/NoteCard.svelte";
import NoteEditor from "$lib/components/note/NoteEditor.svelte";
import { type LanguageCode, t } from "$lib/i18n";

let { data } = $props();

let lang = $derived(data.language as LanguageCode);

let expandedSessionIds = $state(new Set<number>());
let editingNoteId = $state<number | null>(null);
let deletingNoteId = $state<number | null>(null);

const askLabels = $derived({
	askFollowUp: t(lang, "archive.askFollowUp"),
	askWhy: t(lang, "archive.askWhy"),
	askExamples: t(lang, "archive.askExamples"),
	askPlaceholder: t(lang, "archive.askPlaceholder"),
	askSubmit: t(lang, "archive.askSubmit"),
	askThinking: t(lang, "archive.askThinking"),
});

const uiIcons: Record<string, Component> = {
	discord: MessageCircle,
	apple_mail: Mail,
	reddit: MessageSquare,
	imessage: MessageCircle,
	ao3: BookOpen,
};

/** Flatten groups into rows, with per-row showDate flag for dedup */
let rows = $derived(
	(data.groups ?? []).flatMap((group) => {
		let prevDate = "";
		return group.sessions.map((session) => {
			const dateStr = formatDate(new Date(session.completedAt));
			const show = dateStr !== prevDate;
			prevDate = dateStr;
			return { session, group, dateStr, showDate: show };
		});
	}),
);

function toggleSession(id: number) {
	const next = new Set(expandedSessionIds);
	if (next.has(id)) next.delete(id);
	else next.add(id);
	expandedSessionIds = next;
}

function handleEdit(noteId: number) {
	editingNoteId = noteId;
	deletingNoteId = null;
}

function handleDeleteRequest(noteId: number) {
	deletingNoteId = noteId;
	editingNoteId = null;
}

function handleSaved() {
	editingNoteId = null;
}

function handleCancel() {
	editingNoteId = null;
	deletingNoteId = null;
}

function formatDate(d: Date): string {
	return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
</script>

<h1 class="text-3xl md:text-4xl text-gray-800 font-medium leading-tight">{t(lang, "archive.title")}</h1>

{#if rows.length === 0}
	<p class="mt-8 text-muted-foreground">{t(lang, "archive.empty")}</p>
{:else}
	<div class="mt-10 relative">
		<!-- Continuous vertical timeline line -->
		<div class="absolute left-[160px] top-0 bottom-0 w-0.5 bg-border"></div>

		{#each rows as row}
			{@const { session, dateStr, showDate } = row}
			{@const allKeywords = session.notes.flatMap((n) => n.keywords ?? []).filter((k, i, arr) => arr.indexOf(k) === i)}
			{@const Icon = uiIcons[session.ui] ?? MessageCircle}
			{@const isExpanded = expandedSessionIds.has(session.id)}
			<div class="flex gap-0 pb-8">
				<!-- Date (left of line, deduped) -->
				<div class="w-[160px] shrink-0 pr-6 pt-[7px] text-right text-sm font-serif tabular-nums text-muted-foreground">{showDate ? dateStr : ""}</div>

				<!-- Icon node on the line -->
				<a href="/task/{session.taskId}/session" class="shrink-0 flex items-start relative -ml-[18px]">
					<div
						class="relative z-10 mt-[5px] flex h-9 w-9 items-center justify-center rounded border-2 border-border bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground transition-colors"
					>
						<Icon size={18} strokeWidth={1.5} />
					</div>
				</a>

				<!-- Content -->
				<div class="min-w-0 flex-1 pl-5 pt-[5px]">
					<button
						type="button"
						class="flex items-center gap-1.5 text-left font-serif text-lg text-foreground hover:text-muted-foreground transition-colors"
						aria-expanded={isExpanded}
						onclick={() => toggleSession(session.id)}
					>
						<ChevronRight size={18} class={`shrink-0 text-muted-foreground transition-transform${isExpanded ? ' rotate-90' : ''}`} />
						{session.taskTitle}
					</button>

					{#if !isExpanded && allKeywords.length > 0}
						<div class="mt-1.5 flex flex-wrap gap-1">
							{#each allKeywords as kw}
								<span class="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">{kw}</span>
							{/each}
						</div>
					{/if}

					{#if isExpanded}
						<div class="mt-4 space-y-3">
							{#if session.notes.length === 0}
								<p class="text-sm text-muted-foreground">No notes in this session.</p>
							{/if}
							{#each session.notes as note (note.id)}
								{#if editingNoteId === note.id}
									<NoteEditor {note} action="?/update" oncancel={handleCancel} onsaved={handleSaved} />
								{:else if deletingNoteId === note.id}
									<form method="POST" action="?/delete" class="rounded-md border border-red-200 bg-red-50 p-4">
										<input type="hidden" name="noteId" value={note.id}>
										<p class="mb-3 text-sm text-red-800">Delete this note? This cannot be undone.</p>
										<div class="flex gap-2">
											<button type="submit" class="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700">Delete</button>
											<button
												type="button"
												onclick={handleCancel}
												class="rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700"
											>
												Cancel
											</button>
										</div>
									</form>
								{:else}
									<NoteCard {note} onedit={() => handleEdit(note.id)} ondelete={() => handleDeleteRequest(note.id)} t={askLabels} />
								{/if}
							{/each}
						</div>
					{/if}
				</div>
			</div>
		{/each}
	</div>
{/if}
