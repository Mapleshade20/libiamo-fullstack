<script lang="ts">
/*
 * A language's flag, as the main app shows it (components/shell/LanguageFlag.svelte): the muted print palette, simple
 * shapes, set square in a hairline like a printed stamp. A language with no one country gets the country most of its
 * learners mean (English: the UK, Portuguese: Portugal, Arabic: a plain green field with a white rule).
 */
let { language, size = 22 }: { language: string; size?: number } = $props();
const R = "#b85159";
const B = "#526984";
const Y = "#e4bf73";
const W = "#faf8f3";
const G = "#5f8a6b";
const K = "#3a3633";
</script>

<svg viewBox="0 0 30 20" width={size} height={Math.round((size * 2) / 3)} aria-hidden="true" class="flag">
	<rect width="30" height="20" fill={W} />
	{#if language === "ja"}
		<circle cx="15" cy="10" r="5.5" fill={R} />
	{:else if language === "fr"}
		<path d="M0 0h10v20H0z" fill={B} />
		<path d="M20 0h10v20H20z" fill={R} />
	{:else if language === "it"}
		<path d="M0 0h10v20H0z" fill={G} />
		<path d="M20 0h10v20H20z" fill={R} />
	{:else if language === "es"}
		<path d="M0 0h30v20H0z" fill={R} />
		<path d="M0 5h30v10H0z" fill={Y} />
	{:else if language === "de"}
		<path d="M0 0h30v7H0z" fill={K} />
		<path d="M0 7h30v6H0z" fill={R} />
		<path d="M0 13h30v7H0z" fill={Y} />
	{:else if language === "nl"}
		<path d="M0 0h30v7H0z" fill={R} />
		<path d="M0 13h30v7H0z" fill={B} />
	{:else if language === "ru"}
		<path d="M0 7h30v6H0z" fill={B} />
		<path d="M0 13h30v7H0z" fill={R} />
	{:else if language === "pl"}
		<path d="M0 10h30v10H0z" fill={R} />
	{:else if language === "pt"}
		<path d="M0 0h12v20H0z" fill={G} />
		<path d="M12 0h18v20H12z" fill={R} />
		<circle cx="12" cy="10" r="3.6" fill={Y} />
	{:else if language === "tr"}
		<path d="M0 0h30v20H0z" fill={R} />
		<circle cx="12" cy="10" r="5" fill={W} />
		<circle cx="13.4" cy="10" r="4" fill={R} />
		<path d="m19.5 10 1.6.5.9-1.4.1 1.6 1.6.5-1.6.5-.1 1.6-.9-1.4-1.6.5 1-1.2Z" fill={W} />
	{:else if language === "zh-CN"}
		<path d="M0 0h30v20H0z" fill={R} />
		<path d="m6 3 1 3h3l-2.5 1.8 1 3L6 9l-2.5 1.8 1-3L2 6h3Z" fill={Y} />
	{:else if language === "ko"}
		<path d="M10.2 10a4.8 4.8 0 0 1 9.6 0Z" fill={R} />
		<path d="M10.2 10a4.8 4.8 0 0 0 9.6 0Z" fill={B} />
		<path d="M3 4.5 6 2.5M3.8 5.7l3-2M24 2.5l3 2M23.2 3.7l3 2M3 15.5l3 2M3.8 14.3l3 2M24 17.5l3-2M23.2 16.3l3-2" stroke={K} stroke-width="0.9" />
	{:else if language === "ar"}
		<path d="M0 0h30v20H0z" fill={G} />
		<path d="M8 12.5h14" stroke={W} stroke-width="1.4" />
		<path d="M9 8.5h12" stroke={W} stroke-width="0.9" stroke-dasharray="2 1" />
	{:else}
		<path d="M0 0h30v20H0z" fill={B} />
		<path d="m0 0 30 20m0-20L0 20" stroke={W} stroke-width="4.5" />
		<path d="M15 0v20M0 10h30" stroke={W} stroke-width="7" />
		<path d="M15 0v20M0 10h30" stroke={R} stroke-width="3.5" />
	{/if}
</svg>

<style>
.flag {
	display: block;
	flex-shrink: 0;
	box-shadow: 0 0 0 1px color-mix(in srgb, var(--ink) 30%, transparent);
}
</style>
