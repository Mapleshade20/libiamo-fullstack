<script lang="ts">
import ChevronLeft from "@lucide/svelte/icons/chevron-left";
import ChevronRight from "@lucide/svelte/icons/chevron-right";
import Search from "@lucide/svelte/icons/search";
import ManageNoteEditor from "$lib/components/review/ManageNoteEditor.svelte";
import { type LanguageCode, t } from "$lib/i18n";
import type { ManagedNote } from "$lib/note-management";

let { data } = $props();
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
	return query ? `/review/manage?${query}` : "/review/manage";
}

function isToday(value: string) {
	const date = new Date(value);
	const now = new Date();
	return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
}

function formatDue(value: string) {
	const date = new Date(value);
	if (isToday(value)) return t(lang, "review.manage.dueToday");
	return `${t(lang, "review.manage.duePrefix")} ${date.toLocaleDateString(lang, { month: "short", day: "numeric" })}`;
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

<div class="space-y-7">
	<form method="GET" class="rounded-2xl border border-border bg-card/70 p-4 shadow-sm">
		<input type="hidden" name="language" value={data.filters.language === "all" ? undefined : data.filters.language}>
		<div class="grid gap-3 md:grid-cols-[minmax(12rem,1fr)_repeat(2,auto)_auto] md:items-end">
			<label class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
				{t(lang, "review.manage.search")}
				<span class="relative mt-1.5 block">
					<Search size={16} class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
					<input
						name="q"
						value={data.filters.search}
						maxlength="200"
						placeholder={t(lang, "review.manage.searchPlaceholder")}
						class="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm font-normal normal-case tracking-normal text-foreground"
					>
				</span>
			</label>
			<label class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
				{t(lang, "review.manage.state")}
				<select
					name="queue"
					value={data.filters.queue}
					class="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm font-normal normal-case tracking-normal text-foreground md:w-28"
				>
					<option value="all">{t(lang, "review.manage.all")}</option>
					<option value="new">{t(lang, "review.count.new")}</option>
					<option value="learning">{t(lang, "review.count.learning")}</option>
					<option value="review">{t(lang, "review.count.review")}</option>
				</select>
			</label>
			<label class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
				{t(lang, "review.manage.source")}
				<select
					name="source"
					value={data.filters.source}
					class="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm font-normal normal-case tracking-normal text-foreground md:w-32"
				>
					<option value="all">{t(lang, "review.manage.all")}</option>
					<option value="practice">{t(lang, "review.manage.quests")}</option>
					<option value="translation">{t(lang, "translate.title")}</option>
				</select>
			</label>
			<div class="flex gap-2">
				<button type="submit" class="h-10 rounded-lg bg-foreground px-4 text-sm font-medium text-background hover:opacity-85">
					{t(lang, "review.manage.filter")}
				</button>
				<a
					href="/review/manage"
					class="flex h-10 items-center rounded-lg border border-border px-3 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
					>{t(lang, "review.manage.clear")}</a
				>
			</div>
		</div>
	</form>

	<div class="grid min-h-[34rem] gap-5 lg:grid-cols-[minmax(17rem,0.72fr)_minmax(0,1.6fr)]">
		<aside class="overflow-hidden rounded-2xl border border-border bg-card" aria-label={t(lang, "review.manage.cards")}>
			<div class="border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
				{notes.length} {t(lang, "review.manage.shown")}
			</div>
			{#if notes.length === 0}
				<div class="px-6 py-16 text-center">
					<p class="font-serif text-xl">{t(lang, "review.manage.noCards")}</p>
					<p class="mt-2 text-sm text-muted-foreground">{t(lang, "review.manage.tryClearing")}</p>
				</div>
			{:else}
				<div
					class="max-h-[42rem] divide-y divide-border overflow-y-auto outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50"
					aria-label={t(lang, "review.manage.shownCards")}
					aria-activedescendant={selectedNoteId === null ? undefined : `managed-note-${selectedNoteId}`}
					role="listbox"
					tabindex="0"
					onkeydown={handleCardListKeydown}
				>
					{#each notes as note (note.id)}
						<button
							type="button"
							id="managed-note-{note.id}"
							data-note-id={note.id}
							role="option"
							tabindex="-1"
							onclick={() => { selectedNoteId = note.id; }}
							class="block w-full px-4 py-3.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50 {selectedNoteId === note.id ? 'bg-stone-200/70' : 'hover:bg-stone-100/65'}"
							aria-selected={selectedNoteId === note.id}
						>
							<div class="grid grid-cols-[minmax(0,1fr)_auto] gap-4">
								<div class="min-w-0">
									<h2 class="line-clamp-1 font-serif text-lg leading-tight">{note.vocab}</h2>
									<p class="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{note.nativeDefinition}</p>
								</div>
								<div class="flex flex-col items-end justify-between gap-3">
									<span
										class="rounded-full border border-border bg-background/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
										>{note.language}</span
									>
									<span
										class="whitespace-nowrap text-[10px] font-semibold uppercase tracking-wider text-muted-foreground {new Date(note.due) <= new Date() || isToday(note.due) ? 'text-amber-700' : ''}"
										>{formatDue(note.due)}</span
									>
								</div>
							</div>
						</button>
					{/each}
				</div>
			{/if}

			{#if data.totalPages > 1}
				<div class="flex items-center justify-between border-t border-border px-3 py-3 text-xs text-muted-foreground">
					<a
						href={pageHref(data.filters.page - 1)}
						aria-disabled={data.filters.page <= 1}
						class="inline-flex items-center gap-1 rounded-md px-2 py-1.5 hover:bg-secondary aria-disabled:pointer-events-none aria-disabled:opacity-35"
						><ChevronLeft size={14} />{t(lang, "review.manage.previous")}</a
					>
					<span>{t(lang, "review.manage.page")} {data.filters.page} {t(lang, "review.manage.of")} {data.totalPages}</span>
					<a
						href={pageHref(data.filters.page + 1)}
						aria-disabled={data.filters.page >= data.totalPages}
						class="inline-flex items-center gap-1 rounded-md px-2 py-1.5 hover:bg-secondary aria-disabled:pointer-events-none aria-disabled:opacity-35"
						>{t(lang, "review.manage.next")}<ChevronRight size={14} /></a
					>
				</div>
			{/if}
		</aside>

		<section class="min-w-0 lg:sticky lg:top-24 lg:self-start" aria-live="polite">
			{#if selectedNote}
				{#key selectedNote.id}
					<ManageNoteEditor note={selectedNote} {lang} onupdate={replaceNote} ondelete={removeNote} />
				{/key}
			{:else}
				<div
					class="flex min-h-80 items-center justify-center rounded-2xl border border-dashed border-border bg-card/35 px-6 text-center text-muted-foreground"
				>
					{t(lang, "review.manage.selectCard")}
				</div>
			{/if}
		</section>
	</div>
</div>
