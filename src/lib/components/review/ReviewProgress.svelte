<script lang="ts">
import { Badge } from "$lib/components/ui/badge";
import { type LanguageCode, t } from "$lib/i18n";

interface Props {
	current: number;
	total: number;
	lang: LanguageCode;
}

let { current, total, lang }: Props = $props();
let pct = $derived(total > 0 ? Math.round((current / total) * 100) : 0);
</script>

<div class="mb-6 flex flex-col gap-2">
	<div class="flex items-center justify-between text-sm text-muted-foreground">
		<span>{t(lang, "review.progress").replace("{current}", String(current)).replace("{total}", String(total))}</span>
		<span>{pct}%</span>
	</div>
	<div class="h-1.5 w-full overflow-hidden rounded-full bg-muted">
		<div class="h-full rounded-full bg-foreground transition-all duration-300" style="width: {pct}%"></div>
	</div>
</div>
