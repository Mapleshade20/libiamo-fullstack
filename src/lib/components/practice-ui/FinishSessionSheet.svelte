<script lang="ts">
import { BottomSheet } from "$lib/components/ui/bottom-sheet";
import { getFinishLabels } from "./finish/i18n";

let {
	show = false,
	language = "en",
	pending = false,
	error = null,
	onConfirm,
	onCancel,
}: {
	show?: boolean;
	language?: string;
	pending?: boolean;
	error?: string | null;
	onConfirm: () => void;
	onCancel: () => void;
} = $props();

const labels = $derived(getFinishLabels(language));
</script>

<BottomSheet
	{show}
	title={labels.title}
	message={labels.message}
	confirmLabel={pending ? labels.pending : labels.confirm}
	cancelLabel={labels.cancel}
	confirmDisabled={pending}
	{onConfirm}
	{onCancel}
>
	{#snippet children()}
		<p class="text-base leading-relaxed text-[#6b6560]">{labels.message}</p>
		{#if error !== null}
			<p class="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error || labels.error}</p>
		{/if}
	{/snippet}
</BottomSheet>
