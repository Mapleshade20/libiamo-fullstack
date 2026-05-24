<script lang="ts">
import AlertCircle from "@lucide/svelte/icons/alert-circle";
import LoaderCircle from "@lucide/svelte/icons/loader-circle";

let {
	message = "Feedback could not be generated. Your session is saved, and you can retry the evaluation.",
	retryLabel = "Retry feedback",
	isRetrying = false,
	dark = false,
	onRetry = () => {},
}: {
	message?: string;
	retryLabel?: string;
	isRetrying?: boolean;
	dark?: boolean;
	onRetry?: () => void;
} = $props();
</script>

<div
	class={dark
		? "mx-3 my-3 rounded-lg border border-amber-400/30 bg-amber-500/10 p-4 text-amber-50"
		: "mx-3 my-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-950"}
>
	<div class="flex items-start gap-3">
		<AlertCircle size={18} class="mt-0.5 shrink-0" />
		<div class="min-w-0 flex-1">
			<p class="text-sm leading-relaxed">{message}</p>
			<button
				type="button"
				class={dark
					? "mt-3 inline-flex items-center gap-2 rounded-md bg-amber-300 px-3 py-1.5 text-sm font-medium text-amber-950 hover:bg-amber-200 disabled:opacity-60"
					: "mt-3 inline-flex items-center gap-2 rounded-md bg-amber-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-800 disabled:opacity-60"}
				disabled={isRetrying}
				onclick={onRetry}
			>
				{#if isRetrying}
					<LoaderCircle size={15} class="animate-spin" />
				{/if}
				{retryLabel}
			</button>
		</div>
	</div>
</div>
