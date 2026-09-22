<script lang="ts">
import { untrack } from "svelte";
import { dev } from "$app/environment";
import { createStreakDay } from "$lib/client/streak-day.svelte";
import { getStreakPresentation } from "$lib/client/streak-presentation.svelte";
import { streakPreview } from "$lib/client/streak-preview.svelte";
import type { LanguageCode } from "$lib/constants";
import { type StreakRecord, viewStreak } from "$lib/streak";
import { advancePresentationReceipt, type CelebrationKind, type PresentationReceipt, parsePresentationReceipt } from "$lib/streak-presentation";
import StreakCelebration from "./StreakCelebration.svelte";

let { record, userId, lang, dayOffset = 0 }: { record: StreakRecord | null; userId: string; lang: LanguageCode; dayOffset?: number } = $props();
const currentDay = createStreakDay(() => ({ record, offset: dayOffset }));
const presentation = getStreakPresentation();
const today = $derived(currentDay());
const lab = $derived(dev && streakPreview.today !== null);
const shownDay = $derived((dev ? streakPreview.today : null) ?? today);
const view = $derived(viewStreak((dev ? streakPreview.record : null) ?? record, shownDay));
let pending = $state<CelebrationKind | null>(null);
let memory: PresentationReceipt | null = null;
let memoryUser = "";
let rehearsal: PresentationReceipt | null = null;
let rehearsalEpoch = -1;

// Layout survives SPA navigation; storage also carries the receipt across practice's hard reload.
// Pending progress is not consumed until the workflow explicitly exposes its settlement surface.
$effect(() => {
	if (lab) {
		const epoch = streakPreview.epoch;
		const current = view;
		const day = shownDay;
		untrack(() => {
			if (epoch !== rehearsalEpoch) {
				rehearsal = null;
				rehearsalEpoch = epoch;
			}
			rehearsal = advancePresentationReceipt(rehearsal, current, day);
			pending = rehearsal.pending;
		});
		return;
	}
	const currentView = view;
	const day = today;
	const id = userId;
	untrack(() => {
		const key = `libiamo:streak-progress:${id}`;
		if (memoryUser !== id) {
			memoryUser = id;
			memory = null;
			pending = null;
		}
		try {
			memory = parsePresentationReceipt(sessionStorage.getItem(key)) ?? memory;
		} catch {
			/* Restricted storage falls back to this layout instance. */
		}
		memory = advancePresentationReceipt(memory, currentView, day);
		pending = memory.pending;
		try {
			sessionStorage.setItem(key, JSON.stringify({ ...memory, pending }));
		} catch {
			/* Optional receipt. */
		}
	});
});
$effect(() => {
	if (!presentation.ready || !pending) return;
	const kind = pending;
	untrack(() => {
		pending = null;
		if (lab) {
			if (rehearsal) rehearsal = { ...rehearsal, pending: null };
		} else {
			if (memory) memory = { ...memory, pending: null };
			try {
				sessionStorage.setItem(`libiamo:streak-progress:${userId}`, JSON.stringify(memory));
			} catch {
				/* Optional receipt. */
			}
		}
		presentation.play(kind);
	});
});
$effect(() => {
	if (!presentation.ready) presentation.show = null;
});
$effect(() => {
	if (!dev) return;
	const replay = streakPreview.replay;
	if (replay?.event.kind === "lit") untrack(() => presentation.play("ignite"));
});
</script>
{#if presentation.show}
	{#key presentation.show.token}
		<StreakCelebration kind={presentation.show.kind} {view} today={shownDay} {lang} ondone={() => { presentation.show = null; }} />
	{/key}
{/if}
