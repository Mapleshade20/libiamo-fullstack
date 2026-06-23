<script lang="ts">
import BookOpen from "@lucide/svelte/icons/book-open";
import ChevronRight from "@lucide/svelte/icons/chevron-right";
import Mail from "@lucide/svelte/icons/mail";
import MessageCircle from "@lucide/svelte/icons/message-circle";
import MessageSquare from "@lucide/svelte/icons/message-square";
import type { Component } from "svelte";
import { deserialize } from "$app/forms";
import NoteCard from "$lib/components/note/NoteCard.svelte";
import NoteEditor from "$lib/components/note/NoteEditor.svelte";
import { type LanguageCode, t } from "$lib/i18n";
import { dispatchQuotaNoticeFromData } from "$lib/quota-notices";
import type { PageData } from "./$types";

type ArchiveGroups = PageData["groups"];
type ArchiveNote = ArchiveGroups[number]["sessions"][number]["notes"][number];

let { data } = $props();

let lang = $derived(data.user.activeLanguage as LanguageCode);
let groups = $state<ArchiveGroups>((() => data.groups ?? [])());
let expandedSessionIds = $state(new Set<number>());
let editingNoteId = $state<number | null>(null);
let deletingNoteId = $state<number | null>(null);
let deleteError = $state<string | null>(null);
let creatingCardIds = $state(new Set<number>());

$effect(() => {
	groups = data.groups ?? [];
});

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
	groups.flatMap((group) => {
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
	deleteError = null;
}

function handleDeleteRequest(noteId: number) {
	deletingNoteId = noteId;
	editingNoteId = null;
	deleteError = null;
}

function handleCancel() {
	editingNoteId = null;
	deletingNoteId = null;
	deleteError = null;
}

async function saveNote(noteId: number, input: { tutorComment: string; keywords: string[] }) {
	const formData = new FormData();
	formData.append("noteId", String(noteId));
	formData.append("tutorComment", input.tutorComment);
	formData.append("keywords", input.keywords.join(", "));

	const response = await fetch("?/update", { method: "POST", body: formData });
	const result = deserialize(await response.text());

	if (result.type !== "success" || !result.data?.note) {
		throw new Error((result.type === "failure" ? (result.data?.error as string | undefined) : undefined) ?? "Failed to save note");
	}

	replaceNote(result.data.note as ArchiveNote);
	editingNoteId = null;
}

async function deleteNote(noteId: number) {
	const formData = new FormData();
	formData.append("noteId", String(noteId));

	deleteError = null;
	const response = await fetch("?/delete", { method: "POST", body: formData });
	const result = deserialize(await response.text());

	if (result.type !== "success") {
		deleteError = (result.type === "failure" ? (result.data?.error as string | undefined) : undefined) ?? "Failed to delete note";
		return;
	}

	removeNote(noteId);
	deletingNoteId = null;
}

function replaceNote(updated: ArchiveNote) {
	groups = groups.map((group) => ({
		...group,
		sessions: group.sessions.map((session) => ({
			...session,
			notes: session.notes.map((note) => (note.id === updated.id ? updated : note)),
		})),
	}));
}

function removeNote(noteId: number) {
	groups = groups.map((group) => ({
		...group,
		sessions: group.sessions.map((session) => ({
			...session,
			notes: session.notes.filter((note) => note.id !== noteId),
		})),
	}));
}

function formatDate(d: Date): string {
	return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

async function createReviewCard(noteId: number) {
	creatingCardIds = new Set(creatingCardIds).add(noteId);
	try {
		const res = await fetch("/api/review/create-card", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ noteId }),
		});
		if (res.ok) {
			const data = await res.json();
			dispatchQuotaNoticeFromData(data);
			if (data.created) markNoteHasCard(noteId);
		} else {
			dispatchQuotaNoticeFromData(await res.json().catch(() => null));
		}
	} catch {
		// silently ignore
	} finally {
		creatingCardIds.delete(noteId);
		creatingCardIds = new Set(creatingCardIds);
	}
}

function markNoteHasCard(noteId: number) {
	groups = groups.map((group) => ({
		...group,
		sessions: group.sessions.map((session) => ({
			...session,
			notes: session.notes.map((note) => (note.id === noteId ? { ...note, hasReviewCard: true } : note)),
		})),
	}));
}
</script>

<svelte:head>
	<title>Archive · Libiamo</title>
	<meta name="description" content="Review saved notes, explanations, and language feedback from past sessions.">
</svelte:head>

<h1 class="text-3xl text-gray-800 font-medium leading-tight">{t(lang, "archive.title")}</h1>

{#if rows.length === 0}
	<p class="mt-8 text-muted-foreground">{t(lang, "archive.empty")}</p>
{:else}
	<div class="mt-10 relative">
		<!-- Continuous vertical timeline line -->
		<div class="absolute left-6 sm:left-[72px] top-0 bottom-0 w-0.5 bg-border"></div>

		{#each rows as row (row.session.id)}
			{@const { session, dateStr, showDate } = row}
			{@const allKeywords = session.notes.flatMap((n) => n.keywords ?? []).filter((k, i, arr) => arr.indexOf(k) === i)}
			{@const Icon = uiIcons[session.ui] ?? MessageCircle}
			{@const isExpanded = expandedSessionIds.has(session.id)}
			<div class="flex gap-0 pb-8">
				<!-- Date (left of line, desktop) -->
				<div class="hidden sm:block w-[72px] shrink-0 pr-3 pt-[7px] text-left text-sm font-serif tabular-nums text-muted-foreground">
					{showDate ? dateStr : ""}
				</div>
				<div class="w-6 sm:hidden shrink-0"></div>
				<!-- Icon node on the line -->
				<a href="/task/{session.taskId}/feedback" class="shrink-0 flex items-start relative -ml-[18px]">
					<div
						class="relative z-10 mt-[5px] flex h-9 w-9 items-center justify-center rounded border-2 border-border bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground transition-colors"
					>
						<Icon size={18} strokeWidth={1.5} />
					</div>
				</a>

				<!-- Content -->
				<div class="min-w-0 flex-1 pl-5 pt-[5px]">
					{#if showDate}
						<p class="sm:hidden my-1 text-xs font-serif tabular-nums text-muted-foreground">{dateStr}</p>
					{/if}
					<button
						type="button"
						class="relative inline-flex items-center text-left font-serif text-lg text-foreground hover:text-muted-foreground transition-colors"
						aria-expanded={isExpanded}
						onclick={() => toggleSession(session.id)}
					>
						<ChevronRight
							size={18}
							class={`absolute -left-5 top-1/2 -translate-y-1/2 shrink-0 text-muted-foreground transition-transform sm:hidden${isExpanded ? ' rotate-90' : ''}`}
						/>
						<ChevronRight
							size={18}
							class={`hidden shrink-0 text-muted-foreground transition-transform sm:block sm:mr-1.5${isExpanded ? ' rotate-90' : ''}`}
						/>
						<span>{session.taskTitle}</span>
					</button>

					{#if !isExpanded && allKeywords.length > 0}
						<div class="mt-1.5 flex flex-wrap gap-1">
							{#each allKeywords as kw}
								<span class="rounded-full bg-muted px-2.5 py-0.5 text-sm font-medium text-muted-foreground">{kw}</span>
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
									<NoteEditor {note} oncancel={handleCancel} onsave={(input) => saveNote(note.id, input)} />
								{:else if deletingNoteId === note.id}
									<div class="rounded-md border border-red-200 bg-red-50 p-4">
										<p class="mb-3 text-sm text-red-800">Delete this note? Any associated review card will also be deleted. This cannot be undone.</p>
										{#if deleteError}
											<p class="mb-3 text-xs font-medium text-red-700">{deleteError}</p>
										{/if}
										<div class="flex gap-2">
											<button
												type="button"
												onclick={() => deleteNote(note.id)}
												class="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
											>
												Delete
											</button>
											<button
												type="button"
												onclick={handleCancel}
												class="rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700"
											>
												Cancel
											</button>
										</div>
									</div>
								{:else}
									<NoteCard
										{note}
										hasReviewCard={note.hasReviewCard}
										creating={creatingCardIds.has(note.id)}
										onedit={() => handleEdit(note.id)}
										ondelete={() => handleDeleteRequest(note.id)}
										oncreateCard={() => createReviewCard(note.id)}
										t={askLabels}
									/>
								{/if}
							{/each}
						</div>
					{/if}
				</div>
			</div>
		{/each}
	</div>
{/if}
