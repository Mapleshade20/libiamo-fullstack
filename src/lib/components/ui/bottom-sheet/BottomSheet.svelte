<script lang="ts">
import { fade, fly } from "svelte/transition";
import { Button } from "$lib/components/ui/button";

let {
	show = false,
	title = "Confirm",
	message = "Are you sure?",
	confirmLabel = "Confirm",
	cancelLabel = "Cancel",
	onConfirm,
	onCancel,
}: {
	show?: boolean;
	title?: string;
	message?: string;
	confirmLabel?: string;
	cancelLabel?: string;
	onConfirm: () => void;
	onCancel: () => void;
} = $props();

function handleBackdropClick(event: MouseEvent) {
	if (event.target === event.currentTarget) {
		onCancel();
	}
}
</script>

{#if show}
	<!-- Backdrop -->
	<button
		type="button"
		class="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
		onclick={handleBackdropClick}
		transition:fade={{ duration: 200 }}
		aria-label="Close dialog"
	></button>

	<!-- Bottom sheet -->
	<div
		class="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl border-t border-[#e8e3db] bg-white shadow-2xl"
		transition:fly={{ y: 100, duration: 300 }}
	>
		<div class="mx-auto max-w-lg p-6">
			<!-- Handle bar -->
			<div class="mx-auto mb-4 h-1 w-12 rounded-full bg-[#e8e3db]"></div>

			<!-- Content -->
			<div class="mb-6">
				<h3 class="text-xl font-serif text-[#2a2520] mb-2">{title}</h3>
				<p class="text-sm text-[#6b6560] leading-relaxed">{message}</p>
			</div>

			<!-- Actions -->
			<div class="flex gap-3">
				<Button variant="outline" class="flex-1" onclick={onCancel}> {cancelLabel} </Button>
				<Button class="flex-1 bg-gradient-to-br from-[#4a7c59] to-[#3d6849] hover:from-[#3d6849] hover:to-[#2f5237]" onclick={onConfirm}>
					{confirmLabel}
				</Button>
			</div>
		</div>
	</div>
{/if}
