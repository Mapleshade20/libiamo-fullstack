<script lang="ts">
import FloatingPanel from "$lib/components/common/FloatingPanel.svelte";
import MarkdownRenderer from "$lib/components/common/MarkdownRenderer.svelte";
import type { LanguageCode } from "$lib/constants";
import { t } from "$lib/i18n";
import type { HallAnnouncement } from "$lib/server/announcement";
import { getDisplayClock } from "$lib/time/display-clock";
import { absorbInto } from "./announcement-motion";

/** The Hall's brand mark doubles as the collection of announcements the learner has read. */
let { announcements, lang }: { announcements: HallAnnouncement[]; lang: LanguageCode } = $props();
let open = $state(false);
let mark = $state<SVGSVGElement>();
const displayClock = getDisplayClock();

/** Where a tossed announcement should land. */
export function target(): DOMRect | null {
	return mark?.getBoundingClientRect() ?? null;
}

/** Plays the catch once an announcement has landed. */
export function receive(): void {
	if (mark) absorbInto(mark.querySelectorAll("path"));
}

function publishedOn(date: Date): string {
	return new Intl.DateTimeFormat(lang, { month: "short", day: "numeric", timeZone: displayClock().timeZone }).format(date);
}
</script>

<FloatingPanel bind:open label={t(lang, "hall.announcements.title")} triggerClass="shrink-0 p-1" class="w-80 p-0">
	{#snippet trigger()}
		<!-- The two quotes of the favicon, without its tile. -->
		<svg bind:this={mark} class="quotes" width="52" height="42" viewBox="6 11 52 42" aria-hidden="true">
			<path
				d="M13.9 21.6Q14 21.4 14.3 21.5L29.6 25.6Q29.9 25.7 29.9 26C31.2 39.3 21.6 47.8 10.3 46.9Q9.2 46.8 9.9 46.4C13.8 44.3 16.5 42 17.7 39.1C8.1 38 8.4 30.5 13.9 21.6Z"
			/>
			<path
				d="M34.2 21.4L50.5 16.3Q50.9 16.2 51.1 16.6C57 27.1 55.6 34.2 46.2 36.3C46.9 39.8 50.3 43.1 54.3 45.1Q54.9 45.5 54.2 45.6C42.2 47.4 32.4 35.6 33.8 22Q33.8 21.6 34.2 21.4Z"
			/>
		</svg>
	{/snippet}
	<div class="border-b px-4 py-3 font-medium">{t(lang, "hall.announcements.title")}</div>
	{#if announcements.length > 0}
		<ul class="divide-y">
			{#each announcements as announcement (announcement.id)}
				<li class="space-y-1 px-4 py-3">
					<p class="text-xs text-muted-foreground">{publishedOn(announcement.publishedAt)}</p>
					<p class="font-medium">{announcement.title}</p>
					<div class="text-sm text-muted-foreground"><MarkdownRenderer content={announcement.body} /></div>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="px-4 py-6 text-center text-muted-foreground">{t(lang, "hall.announcements.empty")}</p>
	{/if}
</FloatingPanel>

<style>
.quotes {
	fill: #713342;
	overflow: visible;
}

.quotes path {
	transform-box: fill-box;
	transform-origin: 50% 100%;
}
</style>
