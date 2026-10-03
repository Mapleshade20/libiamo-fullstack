<script lang="ts">
import BookOpen from "@lucide/svelte/icons/book-open";
import ChevronRight from "@lucide/svelte/icons/chevron-right";
import Languages from "@lucide/svelte/icons/languages";
import Mail from "@lucide/svelte/icons/mail";
import MessageCircle from "@lucide/svelte/icons/message-circle";
import MessageSquare from "@lucide/svelte/icons/message-square";
import type { Component } from "svelte";
import { deserialize } from "$app/forms";
import ConfirmDialog from "$lib/components/common/ConfirmDialog.svelte";
import NoteCard from "$lib/components/review/NoteCard.svelte";
import type { LanguageCode } from "$lib/constants";
import { t } from "$lib/i18n";
import { getDisplayClock } from "$lib/time/display-clock";
import type { PageData } from "./$types";

type ArchiveGroups = PageData["groups"];

let { data } = $props();
const clock = getDisplayClock();

let lang = $derived(data.user.activeLanguage as LanguageCode);
let groups = $state<ArchiveGroups>((() => data.groups ?? [])());
let expandedActivityKeys = $state(new Set<string>());
let deletingNoteId = $state<number | null>(null);
let deleteError = $state<string | null>(null);
let deleteConfirmOpen = $state(false);

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
	translator: Languages,
};

/** Flatten groups into rows, with per-row showDate flag for dedup */
let rows = $derived(
	groups.flatMap((group) => {
		let prevDate = "";
		return group.activities.map((activity) => {
			const dateStr = formatDate(new Date(activity.completedAt));
			const show = dateStr !== prevDate;
			prevDate = dateStr;
			return { activity, group, dateStr, showDate: show };
		});
	}),
);

function toggleActivity(key: string) {
	const next = new Set(expandedActivityKeys);
	if (next.has(key)) next.delete(key);
	else next.add(key);
	expandedActivityKeys = next;
}

function handleDeleteRequest(noteId: number) {
	deletingNoteId = noteId;
	deleteError = null;
	deleteConfirmOpen = true;
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
	deleteConfirmOpen = false;
}

function removeNote(noteId: number) {
	groups = groups.map((group) => ({
		...group,
		activities: group.activities.map((activity) => ({
			...activity,
			notes: activity.notes.filter((note) => note.id !== noteId),
		})),
	}));
}

function formatDate(d: Date): string {
	return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: clock().timeZone });
}
</script>

<svelte:head>
	<title>Archive · Libiamo</title>
	<meta name="description" content="Review saved notes, explanations, and language feedback from past sessions.">
</svelte:head>

<h1>{t(lang, "archive.title")}</h1>

{#if rows.length === 0}
	<p class="mt-8 text-sm text-muted-foreground">{t(lang, "archive.empty")}</p>
{:else}
	<div class="mt-10 relative">
		<!-- Continuous vertical timeline line -->
		<div class="absolute left-6 sm:left-[72px] top-0 bottom-0 w-0.5 bg-border"></div>

		{#each rows as row (row.activity.activityKey)}
			{@const { activity, dateStr, showDate } = row}
			{@const Icon = uiIcons[activity.ui] ?? MessageCircle}
			{@const isExpanded = expandedActivityKeys.has(activity.activityKey)}
			<div class="flex gap-0 pb-8">
				<!-- Date (left of line, desktop) -->
				<div class="hidden w-[72px] shrink-0 pt-[9px] pr-3 text-left text-sm text-muted-foreground tabular-nums sm:block">
					{showDate ? dateStr : ""}
				</div>
				<div class="w-6 sm:hidden shrink-0"></div>
				<!-- Icon node on the line -->
				<a href={activity.href} class="shrink-0 flex items-start relative -ml-[18px]">
					<div
						class="relative z-10 mt-[5px] flex size-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors duration-150 hover:border-foreground/30 hover:text-foreground"
					>
						<Icon size={18} strokeWidth={1.5} />
					</div>
				</a>

				<!-- Content -->
				<div class="min-w-0 flex-1 pl-5 pt-[5px]">
					{#if showDate}
						<p class="my-1 text-xs text-muted-foreground tabular-nums sm:hidden">{dateStr}</p>
					{/if}
					<button
						type="button"
						class="relative inline-flex min-h-9 cursor-pointer items-center rounded-md text-left text-base font-medium text-foreground transition-colors duration-150 hover:text-foreground/70 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
						aria-expanded={isExpanded}
						onclick={() => toggleActivity(activity.activityKey)}
					>
						<ChevronRight
							size={18}
							class={`absolute -left-5 top-1/2 -translate-y-1/2 shrink-0 text-muted-foreground transition-transform duration-250 ease-panel sm:hidden${isExpanded ? ' rotate-90' : ''}`}
						/>
						<ChevronRight
							size={18}
							class={`hidden shrink-0 text-muted-foreground transition-transform duration-250 ease-panel sm:block sm:mr-1.5${isExpanded ? ' rotate-90' : ''}`}
						/>
						<span>{activity.title}</span>
					</button>

					{#if !isExpanded && activity.notes.length > 0}
						<p class="mt-1.5 line-clamp-1 font-prose text-sm text-muted-foreground">{activity.notes.map((note) => note.vocab).join(" · ")}</p>
					{/if}

					{#if isExpanded}
						<div class="mt-4 space-y-3">
							{#if activity.notes.length === 0}
								<p class="text-sm text-muted-foreground">No notes in this activity.</p>
							{/if}
							{#each activity.notes as note (note.id)}
								<NoteCard {note} ondelete={() => handleDeleteRequest(note.id)} t={askLabels} />
							{/each}
						</div>
					{/if}
				</div>
			</div>
		{/each}
	</div>
{/if}

<ConfirmDialog
	bind:open={deleteConfirmOpen}
	title="Delete this note?"
	message="Its review history is deleted with it. This cannot be undone."
	confirmLabel="Delete"
	cancelLabel="Cancel"
	onconfirm={() => { if (deletingNoteId !== null) void deleteNote(deletingNoteId); }}
>
	{#if deleteError}
		<p class="text-destructive" role="alert">{deleteError}</p>
	{/if}
</ConfirmDialog>
