<script lang="ts">
import { goto } from "$app/navigation";
import { page } from "$app/state";
import { LANGUAGE_CODES, LANGUAGE_LABELS, type LanguageCode } from "$lib/constants";

let { children, data } = $props();

let isManagePage = $derived(page.url.pathname === "/review/manage");
let selectedLanguage = $derived.by((): LanguageCode | "all" => {
	const requestedLanguage = page.url.searchParams.get("language");
	if ((LANGUAGE_CODES as readonly string[]).includes(requestedLanguage ?? "")) return requestedLanguage as LanguageCode;
	if (isManagePage) return "all";
	return data.user.activeLanguage as LanguageCode;
});
let studyLanguage = $derived(selectedLanguage === "all" ? (data.user.activeLanguage as LanguageCode) : selectedLanguage);
let studyHref = $derived(`/review?language=${studyLanguage}`);
let manageHref = $derived(selectedLanguage === "all" ? "/review/manage" : `/review/manage?language=${selectedLanguage}`);

function changeLanguage(event: Event) {
	const language = (event.currentTarget as HTMLSelectElement).value;
	const url = new URL(page.url);
	url.search = "";
	if (isManagePage) {
		if (language !== "all") url.searchParams.set("language", language);
	} else {
		url.searchParams.set("language", language);
	}
	void goto(`${url.pathname}${url.search}`, { keepFocus: true, noScroll: true });
}
</script>

<div class="space-y-7">
	<header class="review-route-header flex flex-col items-center gap-4 sm:h-[1.875rem] sm:flex-row sm:items-stretch sm:justify-between">
		<div class="flex h-[1.875rem] items-stretch gap-3">
			<h1 class="font-serif text-3xl leading-none">Review</h1>
			<label class="sr-only" for="review-language">Review language</label>
			<select
				id="review-language"
				value={selectedLanguage}
				class="h-[1.875rem] rounded-full border border-border bg-card px-3 text-xs font-semibold uppercase tracking-wider text-foreground shadow-sm"
				onchange={changeLanguage}
			>
				{#if isManagePage}
					<option value="all">All languages</option>
				{/if}
				{#each LANGUAGE_CODES as code}
					<option value={code}>{LANGUAGE_LABELS[code]}</option>
				{/each}
			</select>
		</div>

		<nav class="inline-flex h-[1.875rem] rounded-full border border-border bg-card p-0.5 text-sm shadow-sm" aria-label="Review pages">
			<a
				href={studyHref}
				aria-current={isManagePage ? undefined : "page"}
				class="inline-flex h-full items-center rounded-full px-4 {isManagePage
					? 'text-muted-foreground transition-colors hover:text-foreground'
					: 'bg-foreground font-medium text-background'}"
				>Study</a
			>
			<a
				href={manageHref}
				aria-current={isManagePage ? "page" : undefined}
				class="inline-flex h-full items-center rounded-full px-4 {isManagePage
					? 'bg-foreground font-medium text-background'
					: 'text-muted-foreground transition-colors hover:text-foreground'}"
				>Manage</a
			>
		</nav>
	</header>

	<div>{@render children()}</div>
</div>
