<script lang="ts">
import { type LanguageCode, t } from "$lib/i18n";

interface Props {
	cardsReviewed: number;
	timeSpentSeconds: number;
	lang: LanguageCode;
}

let { cardsReviewed, timeSpentSeconds, lang }: Props = $props();

let timeDisplay = $derived(() => {
	const m = Math.floor(timeSpentSeconds / 60);
	const s = timeSpentSeconds % 60;
	return `${m}:${String(s).padStart(2, "0")}`;
});
</script>

<div class="flex flex-col items-center gap-6 py-12">
	<h2 class="text-3xl">{t(lang, "review.summary.title")}</h2>

	<div class="flex gap-8 text-center">
		<div>
			<p class="text-4xl font-light">{cardsReviewed}</p>
			<p class="text-sm text-muted-foreground">{t(lang, "review.summary.cardsReviewed")}</p>
		</div>
		<div>
			<p class="text-4xl font-light">{timeDisplay()}</p>
			<p class="text-sm text-muted-foreground">{t(lang, "review.summary.timeSpent")}</p>
		</div>
	</div>
</div>
