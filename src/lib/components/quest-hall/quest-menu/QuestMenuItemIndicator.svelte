<script lang="ts">
import { type LanguageCode, UI_VARIANT_LABELS, type UiVariant } from "$lib/constants";
import { t } from "$lib/i18n";
import type { QuestMenuItem } from "$lib/quest-hall/menu";
import NotificationIcon from "./NotificationIcon.svelte";
import "./difficulty.css";

let { item, lang }: { item: QuestMenuItem; lang: LanguageCode } = $props();
let difficulty = $derived(item.kind === "quest" ? item.task.templateDifficulty : item.task.difficulty);
let ui = $derived(item.kind === "quest" ? item.task.templateUi : "translator");
let channel = $derived(UI_VARIANT_LABELS[ui as UiVariant] ?? ui);
</script>

<span class="indicator quest-difficulty-tone" data-level={difficulty}>
	<span class="channel-icon" role="img" aria-label={channel} title={channel}><NotificationIcon {ui} /></span>
	<span
		class="difficulty"
		role="img"
		aria-label={`${t(lang, "hall.difficulty")}: ${difficulty}/3`}
		title={`${t(lang, "hall.difficulty")}: ${difficulty}/3`}
	>
		{#each [1, 2, 3] as level}
			<span class="difficulty-dot" class:is-filled={level <= difficulty} aria-hidden="true"></span>
		{/each}
	</span>
</span>

<style>
.indicator {
	display: inline-flex;
	align-items: center;
	gap: 0.8rem;
	color: var(--quest-difficulty-color);
}
.channel-icon,
.difficulty {
	display: inline-flex;
	align-items: center;
	gap: 0.3rem;
}
.channel-icon :global(svg) {
	width: 19px;
	height: 19px;
}
.difficulty-dot {
	width: 8px;
	height: 8px;
	border: 1px solid currentColor;
	border-radius: 50%;
}
.difficulty-dot.is-filled {
	background: currentColor;
}
</style>
