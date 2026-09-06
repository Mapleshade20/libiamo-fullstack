<script lang="ts">
import QuestMenu from "$lib/components/quest-hall/quest-menu/QuestMenu.svelte";
import type { LanguageCode } from "$lib/constants";

let { data } = $props();
let lang = $derived(data.activeLanguage as LanguageCode);
</script>

<svelte:head>
	<title>Quest Hall · Libiamo</title>
	<meta name="description" content="Choose today's language practice quests and continue your learning routine.">
</svelte:head>

{#key data.activeLanguage}
	<QuestMenu {data} initialLocation={data.hallLocation} initialPreparation={data.initialPreparation} accountScope={data.accountScope} {lang} />
{/key}
