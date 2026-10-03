<script lang="ts">
import { goto } from "$app/navigation";
import { base } from "$app/paths";
import { page } from "$app/state";
import SegmentedControl from "$lib/components/common/SegmentedControl.svelte";
import Select from "$lib/components/common/Select.svelte";
import { LANGUAGE_CODES, LANGUAGE_LABELS, type LanguageCode } from "$lib/constants";

let { children, data } = $props();

let isManagePage = $derived(page.url.pathname === `${base}/review/manage`);
let selectedLanguage = $derived.by((): LanguageCode | "all" => {
	const requestedLanguage = page.url.searchParams.get("language");
	if ((LANGUAGE_CODES as readonly string[]).includes(requestedLanguage ?? "")) return requestedLanguage as LanguageCode;
	if (isManagePage) return "all";
	return data.user.activeLanguage as LanguageCode;
});
let studyLanguage = $derived(selectedLanguage === "all" ? (data.user.activeLanguage as LanguageCode) : selectedLanguage);
let studyHref = $derived(`${base}/review?language=${studyLanguage}`);
let manageHref = $derived(selectedLanguage === "all" ? `${base}/review/manage` : `${base}/review/manage?language=${selectedLanguage}`);

let languageItems = $derived([
	...(isManagePage ? [{ value: "all", label: "All languages" }] : []),
	...LANGUAGE_CODES.map((code) => ({ value: code, label: LANGUAGE_LABELS[code] })),
]);

function changeLanguage(language: string) {
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
	<header class="review-route-header flex flex-wrap items-center justify-between gap-4">
		<h1>Review</h1>
		<div class="ml-auto flex max-w-full min-w-0 items-center gap-2 sm:gap-3">
			<Select items={languageItems} value={selectedLanguage} variant="ghost" aria-label="Review language" onValueChange={changeLanguage} />
			<SegmentedControl
				label="Review pages"
				value={isManagePage ? "manage" : "study"}
				items={[
					{ value: "study", label: "Study", href: studyHref },
					{ value: "manage", label: "Manage", href: manageHref },
				]}
			/>
		</div>
	</header>

	<div>{@render children()}</div>
</div>
