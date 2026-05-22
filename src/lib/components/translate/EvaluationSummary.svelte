<script lang="ts">
import Loader from "@lucide/svelte/icons/loader-circle";
import Trophy from "@lucide/svelte/icons/trophy";

interface Props {
	overallScore?: string;
	overallFeedback?: string;
	evaluating?: boolean;
	compact?: boolean;
}

let { overallScore, overallFeedback, evaluating = false, compact = false }: Props = $props();

function scoreColor(score?: string): string {
	if (!score) return "text-foreground";
	if (score === "A") return "text-green-600";
	if (score === "B") return "text-yellow-600";
	return "text-red-600";
}
</script>

<div class="rounded-xl bg-foreground/5 border border-border space-y-3 {compact ? 'p-4' : 'p-5'}">
	<div class="flex items-center gap-2">
		<Trophy size={14} strokeWidth={1.5} class="text-muted-foreground" />
		<span class="text-xs font-bold uppercase tracking-widest text-muted-foreground">Evaluation</span>
		{#if evaluating}
			<Loader size={14} class="animate-spin text-muted-foreground" />
		{/if}
	</div>
	{#if overallScore}
		<div class="flex items-center gap-3"><span class="text-4xl font-serif {scoreColor(overallScore)}">{overallScore}</span></div>
	{/if}
	{#if overallFeedback}
		<p class="text-sm text-muted-foreground leading-relaxed">{overallFeedback}</p>
	{/if}
</div>
