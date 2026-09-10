<script lang="ts">
import type { QuestMenuRouteData } from "$lib/quest-hall/preparation";
import QuestMenu from "./quest-menu/QuestMenu.svelte";

let { route, form = null }: { route: QuestMenuRouteData; form?: { error?: string } | null } = $props();
</script>

{#key route.hall.activeLanguage}
	<QuestMenu
		data={route.hall}
		initialLocation={route.hallLocation}
		catalogMonth={route.catalogMonth}
		initialPreparation={route.initialPreparation}
		lang={route.hall.activeLanguage}
		{form}
	/>
{/key}
