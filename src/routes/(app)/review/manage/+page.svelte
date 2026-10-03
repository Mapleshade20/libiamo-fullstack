<script lang="ts">
import ChevronLeft from "@lucide/svelte/icons/chevron-left";
import ChevronRight from "@lucide/svelte/icons/chevron-right";
import Search from "@lucide/svelte/icons/search";
import { base } from "$app/paths";
import Select from "$lib/components/common/Select.svelte";
import ManageNoteEditor from "$lib/components/review/ManageNoteEditor.svelte";
import { Badge } from "$lib/components/ui/badge";
import { Button } from "$lib/components/ui/button";
import { Input } from "$lib/components/ui/input";
import type { LanguageCode } from "$lib/constants";
import { t } from "$lib/i18n";
import type { ManagedNote } from "$lib/review/manage";
import { getDisplayClock, isDisplayDay } from "$lib/time/display-clock";

let { data } = $props();
const clock = getDisplayClock();
let lang = $derived(data.user.activeLanguage as LanguageCode);
let notes = $state<ManagedNote[]>((() => data.notes)());
let selectedNoteId = $state<number | null>((() => data.filters.selectedNoteId ?? data.notes[0]?.id ?? null)());
let selectedNoteFromLink = $state<ManagedNote | null>((() => data.selectedNote)());
let loadedFilterKey = $state("");
let total = $state((() => data.total)());

let filterKey = $derived(JSON.stringify(data.filters));
let selectedNote = $derived(
	notes.find((note) => note.id === selectedNoteId) ?? (selectedNoteFromLink?.id === selectedNoteId ? selectedNoteFromLink : null),
);

$effect(() => {
	if (filterKey === loadedFilterKey) return;
	loadedFilterKey = filterKey;
	notes = data.notes;
	selectedNoteFromLink = data.selectedNote;
	total = data.total;
	if (data.filters.selectedNoteId && data.selectedNote?.id === data.filters.selectedNoteId) selectedNoteId = data.filters.selectedNoteId;
	else if (!notes.some((note) => note.id === selectedNoteId)) selectedNoteId = notes[0]?.id ?? null;
});

function replaceNote(updated: ManagedNote) {
	notes = notes.map((note) => (note.id === updated.id ? updated : note));
	if (selectedNoteFromLink?.id === updated.id) selectedNoteFromLink = updated;
}

function removeNote(noteId: number) {
	const deletedIndex = notes.findIndex((note) => note.id === noteId);
	notes = notes.filter((note) => note.id !== noteId);
	if (selectedNoteFromLink?.id === noteId) selectedNoteFromLink = null;
	total = Math.max(0, total - 1);
	selectedNoteId = notes[Math.min(Math.max(0, deletedIndex), notes.length - 1)]?.id ?? null;
}

function pageHref(page: number) {
	const params = new URLSearchParams();
	if (data.filters.search) params.set("q", data.filters.search);
	if (data.filters.language !== "all") params.set("language", data.filters.language);
	if (data.filters.queue !== "all") params.set("queue", data.filters.queue);
	if (data.filters.source !== "all") params.set("source", data.filters.source);
	if (page > 1) params.set("page", String(page));
	const query = params.toString();
	return query ? `${base}/review/manage?${query}` : `${base}/review/manage`;
}

function isToday(value: string) {
	return isDisplayDay(value, clock());
}

function formatDue(value: string) {
	const date = new Date(value);
	if (isToday(value)) return t(lang, "review.manage.dueToday");
	return `${t(lang, "review.manage.duePrefix")} ${date.toLocaleDateString(lang, { month: "short", day: "numeric", timeZone: clock().timeZone })}`;
}

function handleCardListKeydown(event: KeyboardEvent) {
	if ((event.key !== "ArrowUp" && event.key !== "ArrowDown") || notes.length === 0) return;
	event.preventDefault();

	const selectedIndex = notes.findIndex((note) => note.id === selectedNoteId);
	const nextIndex =
		event.key === "ArrowUp" ? Math.max(0, selectedIndex < 0 ? notes.length - 1 : selectedIndex - 1) : Math.min(notes.length - 1, selectedIndex + 1);
	const nextNote = notes[nextIndex];
	if (!nextNote) return;
	selectedNoteId = nextNote.id;
	(event.currentTarget as HTMLElement).querySelector<HTMLButtonElement>(`[data-note-id="${nextNote.id}"]`)?.focus();
}
</script>

<svelte:head>
	<title>{t(lang, "review.manage.title")} · Libiamo</title>
	<meta name="description" content={t(lang, "review.manage.description")}>
</svelte:head>

<div class="space-y-6">
	<form method="GET" class="flex flex-wrap items-end gap-3" role="search">
		<input type="hidden" name="language" value={data.filters.language === "all" ? undefined : data.filters.language}>
		<div class="flex min-w-[min(100%,16rem)] flex-1 flex-col gap-1.5">
			<label for="manage-search" class="text-sm font-medium">{t(lang, "review.manage.search")}</label>
			<span class="relative block">
				<Search size={16} class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
				<Input
					id="manage-search"
					name="q"
					value={data.filters.search}
					maxlength={200}
					placeholder={t(lang, "review.manage.searchPlaceholder")}
					class="pl-9"
				/>
			</span>
		</div>
		<div class="flex w-[calc(50%-0.375rem)] flex-col gap-1.5 sm:w-36">
			<label for="manage-queue" class="text-sm font-medium">{t(lang, "review.manage.state")}</label>
			<Select
				id="manage-queue"
				name="queue"
				value={data.filters.queue}
				submitOnChange
				items={[
					{ value: "all", label: t(lang, "review.manage.all") },
					{ value: "new", label: t(lang, "review.count.new") },
					{ value: "learning", label: t(lang, "review.count.learning") },
					{ value: "review", label: t(lang, "review.count.review") },
				]}
			/>
		</div>
		<div class="flex w-[calc(50%-0.375rem)] flex-col gap-1.5 sm:w-36">
			<label for="manage-source" class="text-sm font-medium">{t(lang, "review.manage.source")}</label>
			<Select
				id="manage-source"
				name="source"
				value={data.filters.source}
				submitOnChange
				items={[
					{ value: "all", label: t(lang, "review.manage.all") },
					{ value: "practice", label: t(lang, "review.manage.quests") },
					{ value: "translation", label: t(lang, "translate.title") },
				]}
			/>
		</div>
		<div class="flex gap-2">
			<Button type="submit">{t(lang, "review.manage.filter")}</Button>
			<Button href="{base}/review/manage" variant="ghost">{t(lang, "review.manage.clear")}</Button>
		</div>
	</form>

	<div class="grid min-h-[34rem] gap-5 lg:grid-cols-[minmax(17rem,0.72fr)_minmax(0,1.6fr)]">
		<aside class="self-start overflow-hidden rounded-xl border border-border bg-card" aria-label={t(lang, "review.manage.cards")}>
			<p class="border-b border-border px-4 py-2.5 text-xs text-muted-foreground">{notes.length} {t(lang, "review.manage.shown")}</p>
			{#if notes.length === 0}
				<div class="px-6 py-14 text-center">
					<p class="text-sm font-medium">{t(lang, "review.manage.noCards")}</p>
					<p class="mt-1 text-sm text-muted-foreground">{t(lang, "review.manage.tryClearing")}</p>
				</div>
			{:else}
				<div
					class="max-h-[42rem] divide-y divide-border overflow-y-auto outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50"
					aria-label={t(lang, "review.manage.shownCards")}
					aria-activedescendant={selectedNoteId === null ? undefined : `managed-note-${selectedNoteId}`}
					role="listbox"
					tabindex="0"
					onkeydown={handleCardListKeydown}
				>
					{#each notes as note (note.id)}
						{@const due = new Date(note.due).getTime() <= clock().now || isToday(note.due)}
						<button
							type="button"
							id="managed-note-{note.id}"
							data-note-id={note.id}
							role="option"
							tabindex="-1"
							onclick={() => { selectedNoteId = note.id; }}
							class="block w-full cursor-pointer px-4 py-3 text-left outline-none transition-colors duration-100 focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50 {selectedNoteId === note.id ? 'bg-foreground/[0.05]' : 'hover:bg-foreground/[0.025]'}"
							aria-selected={selectedNoteId === note.id}
						>
							<span class="flex items-baseline justify-between gap-3">
								<span class="min-w-0 truncate text-base font-medium">{note.vocab}</span>
								<Badge variant="outline" class="shrink-0">{note.language.toUpperCase()}</Badge>
							</span>
							<span class="mt-0.5 flex items-end justify-between gap-3">
								<span class="line-clamp-2 min-w-0 text-sm text-muted-foreground">{note.nativeDefinition}</span>
								<span class="shrink-0 whitespace-nowrap text-xs {due ? 'font-medium text-warning' : 'text-muted-foreground'}"
									>{formatDue(note.due)}</span
								>
							</span>
						</button>
					{/each}
				</div>
			{/if}

			{#if data.totalPages > 1}
				<div class="flex items-center justify-between border-t border-border px-2 py-2 text-xs text-muted-foreground">
					<Button href={pageHref(data.filters.page - 1)} variant="ghost" size="sm" disabled={data.filters.page <= 1}
						><ChevronLeft aria-hidden="true" />{t(lang, "review.manage.previous")}</Button
					>
					<span>{t(lang, "review.manage.page")} {data.filters.page} {t(lang, "review.manage.of")} {data.totalPages}</span>
					<Button href={pageHref(data.filters.page + 1)} variant="ghost" size="sm" disabled={data.filters.page >= data.totalPages}
						>{t(lang, "review.manage.next")}<ChevronRight aria-hidden="true" /></Button
					>
				</div>
			{/if}
		</aside>

		<section
			id="note-editor"
			tabindex="-1"
			class="min-w-0 scroll-mt-4 outline-none nav:scroll-mt-24 lg:sticky lg:top-24 lg:self-start"
			aria-label={t(lang, "review.editCurrent")}
			aria-live="polite"
		>
			{#if selectedNote}
				{#key selectedNote.id}
					<ManageNoteEditor note={selectedNote} {lang} onupdate={replaceNote} ondelete={removeNote} />
				{/key}
			{:else}
				<div class="flex min-h-80 items-center justify-center rounded-xl border border-border bg-card px-6 text-center text-sm text-muted-foreground">
					{t(lang, "review.manage.selectCard")}
				</div>
			{/if}
		</section>
	</div>
</div>
