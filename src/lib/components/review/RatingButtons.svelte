<script lang="ts">
import type { LanguageCode } from "$lib/i18n";
import { t } from "$lib/i18n";

interface Props {
	preview: Record<string, string>;
	lang: LanguageCode;
	disabled: boolean;
	onrate: (rating: number) => void;
}

let { preview, lang, disabled, onrate }: Props = $props();

let ratings = $derived([
	{ key: "again", rating: 1, label: t(lang, "review.rating.again"), color: "border-red-200 bg-red-50 text-red-700 active:bg-red-200" },
	{ key: "hard", rating: 2, label: t(lang, "review.rating.hard"), color: "border-orange-200 bg-orange-50 text-orange-700 active:bg-orange-200" },
	{ key: "good", rating: 3, label: t(lang, "review.rating.good"), color: "border-green-200 bg-green-50 text-green-700 active:bg-green-200" },
	{ key: "easy", rating: 4, label: t(lang, "review.rating.easy"), color: "border-blue-200 bg-blue-50 text-blue-700 active:bg-blue-200" },
]);
</script>

<div class="fixed bottom-0 left-0 right-0 z-30 flex gap-1 p-1 sm:relative sm:mt-6 sm:justify-center sm:gap-3 sm:p-0">
	{#each ratings as { key, rating, label, color }}
		<button
			type="button"
			class="flex flex-1 flex-col items-center justify-center gap-0.5 rounded-xl border-2 py-3 text-base transition-colors sm:flex-initial sm:px-5 {color} disabled:opacity-40"
			{disabled}
			onclick={() => onrate(rating)}
		>
			<span>{label}</span>
			<span class="text-xs opacity-60">{preview[key]}</span>
		</button>
	{/each}
</div>
