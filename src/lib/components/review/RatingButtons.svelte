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
	{ key: "again", rating: 1, label: t(lang, "review.rating.again"), color: "bg-red-50 border-red-200 text-red-700 hover:bg-red-100" },
	{ key: "hard", rating: 2, label: t(lang, "review.rating.hard"), color: "bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100" },
	{ key: "good", rating: 3, label: t(lang, "review.rating.good"), color: "bg-green-50 border-green-200 text-green-700 hover:bg-green-100" },
	{ key: "easy", rating: 4, label: t(lang, "review.rating.easy"), color: "bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100" },
]);
</script>

<div class="mt-6 flex items-center justify-center gap-3">
	{#each ratings as { key, rating, label, color }}
		<button
			type="button"
			class="flex flex-col items-center gap-1 rounded-xl border px-5 py-3 text-base font-medium transition-all {color} disabled:opacity-40"
			{disabled}
			onclick={() => onrate(rating)}
		>
			<span>{label}</span>
			<span class="text-xs opacity-60">{preview[key]}</span>
		</button>
	{/each}
</div>
