<script lang="ts">
import QuestMenu from "$lib/components/quest-hall/quest-menu/QuestMenu.svelte";
import UnreadInbox from "$lib/components/quest-hall/UnreadInbox.svelte";
import type { LanguageCode } from "$lib/i18n";

let { data } = $props();
let lang = $derived(data.activeLanguage as LanguageCode);
</script>

<svelte:head>
	<title>Quest Hall · Libiamo</title>
	<meta name="description" content="Choose today's language practice quests and continue your learning routine.">
</svelte:head>

{#key data.activeLanguage}
	<QuestMenu {data} initialLocation={data.hallLocation} initialPreparation={data.initialPreparation} accountScope={data.accountScope} {lang} />

	<div class="legacy-entry-points"><UnreadInbox {lang} /></div>
{/key}

<style>
.legacy-entry-points {
	--hall-wine: #803945;
	display: grid;
	max-width: 78rem;
	justify-content: end;
	align-items: start;
	margin: 2.5rem auto 3rem;
	padding-top: 1.5rem;
	border-top: 1px solid var(--border);
}
</style>
