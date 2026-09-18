<script lang="ts">
import { Portal } from "bits-ui";
import { MediaQuery } from "svelte/reactivity";
import { fade, fly } from "svelte/transition";
import { lockBodyScroll } from "$lib/client/scroll-lock";
import { Button } from "$lib/components/ui/button";

let {
	show = false,
	title = "Confirm",
	message = "Are you sure?",
	confirmLabel = "Confirm",
	confirmDisabled = false,
	cancelLabel = "Cancel",
	onConfirm,
	onCancel,
	children,
}: {
	show?: boolean;
	title?: string;
	message?: string;
	confirmLabel?: string;
	confirmDisabled?: boolean;
	cancelLabel?: string;
	onConfirm: () => void;
	onCancel: () => void;
	children?: import("svelte").Snippet;
} = $props();

const reducedMotion = new MediaQuery("(prefers-reduced-motion: reduce)", true);
const titleId = $props.id();

function manageFocus(node: HTMLElement) {
	const trigger = document.activeElement;
	const buttons = () => Array.from(node.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
	buttons()[0]?.focus({ preventScroll: true });
	function handleKeydown(event: KeyboardEvent) {
		if (event.key === "Escape") {
			event.preventDefault();
			onCancel();
		} else if (event.key === "Tab") {
			const targets = buttons();
			const first = targets[0];
			const last = targets.at(-1);
			if (event.shiftKey && document.activeElement === first) {
				event.preventDefault();
				last?.focus({ preventScroll: true });
			} else if (!event.shiftKey && document.activeElement === last) {
				event.preventDefault();
				first?.focus({ preventScroll: true });
			}
		}
	}
	document.addEventListener("keydown", handleKeydown);
	return {
		destroy() {
			document.removeEventListener("keydown", handleKeydown);
			if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus({ preventScroll: true });
		},
	};
}

function handleBackdropClick(event: MouseEvent) {
	if (event.target === event.currentTarget) {
		onCancel();
	}
}

$effect(() => {
	if (!show) return;

	return lockBodyScroll();
});
</script>

{#if show}
	<Portal>
		<div class="fixed inset-0 isolate z-[4000] overscroll-contain" style="margin: 0;">
			<!-- Backdrop: keep blur on its own layer, below the opaque sheet content. -->
			<button
				type="button"
				class="absolute inset-0 z-0 m-0 bg-black/35 backdrop-blur-xs"
				onclick={handleBackdropClick}
				transition:fade|global={{ duration: reducedMotion.current ? 0 : 200 }}
				aria-label={cancelLabel}
				tabindex="-1"
			></button>

			<!-- Bottom sheet -->
			<div
				use:manageFocus
				class="absolute inset-x-0 bottom-0 z-10 max-h-[100dvh] overflow-y-auto overscroll-contain rounded-t-2xl border-t border-[#e8e3db] bg-white text-[#2a2520] shadow-2xl"
				transition:fly|global={{ y: "100%", duration: reducedMotion.current ? 0 : 300 }}
				role="dialog"
				aria-modal="true"
				aria-labelledby={titleId}
			>
				<div class="mx-auto max-w-lg p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
					<!-- Handle bar -->
					<div class="mx-auto mb-4 h-1 w-12 rounded-full bg-[#e8e3db]"></div>

					<!-- Content -->
					<div class="mb-6">
						<h3 id={titleId} class="mb-2 font-serif text-xl font-medium text-[#2a2520]">{title}</h3>
						{#if children}
							{@render children()}
						{:else}
							<p class="text-base leading-relaxed text-[#6b6560]">{message}</p>
						{/if}
					</div>

					<!-- Actions -->
					<div class="flex gap-3">
						<Button variant="outline" class="flex-1" onclick={onCancel}> {cancelLabel} </Button>
						<Button
							class="flex-1 bg-gradient-to-br from-[#4a7c59] to-[#3d6849] hover:from-[#3d6849] hover:to-[#2f5237]"
							onclick={onConfirm}
							disabled={confirmDisabled}
						>
							{confirmLabel}
						</Button>
					</div>
				</div>
			</div>
		</div>
	</Portal>
{/if}
