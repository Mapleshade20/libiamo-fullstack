<script lang="ts">
import type { Snippet } from "svelte";
import { lockBodyScroll } from "$lib/client/scroll-lock";

/**
 * The shared shell for the small modals on the profile: the paper-coloured card,
 * its blurred backdrop and the open/close transition. Callers own the contents
 * and drive it through `open`, so every dialog in the app enters and leaves the
 * same way instead of each one re-deriving the look.
 */
let {
	open: isOpen = $bindable(false),
	labelledby,
	busy = false,
	variant = "card",
	lightDismiss = false,
	motionScale = 1,
	children,
}: {
	open?: boolean;
	/** Id of the heading inside `children` that names this dialog. */
	labelledby: string;
	/** While true, Escape is ignored — an in-flight request should not be abandoned halfway. */
	busy?: boolean;
	variant?: "card" | "sheet";
	/**
	 * Close on a backdrop click, the same as the dialog's own close control. Opt-in and off by
	 * default: a dialog holding an unsaved form or a destructive confirmation must not be
	 * dismissable by a stray click. It honours `busy` exactly as Escape does.
	 */
	lightDismiss?: boolean;
	/** Duration multiplier; zero gives the reduced-motion branch in a rehearsal. */
	motionScale?: number;
	children: Snippet;
} = $props();

let dialog = $state<HTMLDialogElement | null>(null);
// Whatever opened the dialog gets the focus back, so keyboard users return to
// the button they pressed rather than to the top of the page.
let opener: HTMLElement | null = null;
// A click on the backdrop targets the `<dialog>` itself, since the contents fill it. Requiring the
// press to have started there too keeps a text selection dragged out of the card from closing it.
let pressedBackdrop = false;
// Plays the exit while the dialog is still modal, and only then closes it. Leaving the exit to
// `overlay`/`display` transitions keeps the dialog in the top layer only where `overlay` is
// supported; Safari drops it at once, so the backdrop vanished and the card fell into the page flow.
let closing = $state(false);

$effect(() => {
	if (isOpen) return lockBodyScroll();
});

$effect(() => {
	const element = dialog;
	if (!element) return;
	if (isOpen && !element.open) {
		opener = document.activeElement as HTMLElement | null;
		element.showModal();
	} else if (!isOpen && element.open) {
		closing = true;
		let cancelled = false;
		// Wait for the exit styles to apply before collecting their transitions.
		requestAnimationFrame(() => {
			if (cancelled) return;
			const exits = element.getAnimations({ subtree: true }).map((animation) => animation.finished);
			Promise.allSettled(exits).then(() => {
				if (!cancelled) element.close();
			});
		});
		return () => {
			// Reopened (or unmounted) before the exit finished.
			cancelled = true;
			closing = false;
		};
	}
});
</script>

<dialog
	bind:this={dialog}
	class:sheet={variant === "sheet"}
	aria-labelledby={labelledby}
	style="--modal-motion-scale: {motionScale}"
	class:closing
	oncancel={(event) => {
		// Escape goes through `open` too, so it gets the same exit as the close control.
		event.preventDefault();
		if (!busy) isOpen = false;
	}}
	onmousedown={(event) => { pressedBackdrop = event.target === dialog; }}
	onclick={(event) => { if (lightDismiss && !busy && pressedBackdrop && event.target === dialog) isOpen = false; }}
	onclose={() => {
		closing = false;
		isOpen = false;
		opener?.focus({ preventScroll: true });
	}}
>
	{@render children()}
</dialog>

<style>
dialog {
	margin: auto;
	width: min(26rem, calc(100vw - 2rem));
	max-height: calc(100dvh - 2rem);
	padding: 1.75rem;
	border: 1px solid #ded7cd;
	border-radius: 20px;
	background: #faf8f4;
	color: #302c28;
	box-shadow: 0 24px 80px #241b2033;
	opacity: 0;
	transform: translateY(8px) scale(0.98);
	transition:
		opacity calc(220ms * var(--modal-motion-scale)) ease,
		transform calc(220ms * var(--modal-motion-scale)) cubic-bezier(0.22, 1, 0.36, 1);
}
dialog[open]:not(.closing) {
	opacity: 1;
	transform: none;
}
dialog.sheet {
	margin: auto auto 0;
	width: min(34rem, calc(100vw - 1rem));
	max-height: calc(100dvh - 1rem);
	padding: 0;
	border: 0;
	border-radius: 22px 19px 0 0;
	background: transparent;
	box-shadow: none;
	transform: translateY(105%);
	transition-duration: calc(450ms * var(--modal-motion-scale));
}
dialog.sheet[open]:not(.closing) {
	transform: none;
}
dialog::backdrop {
	background: #28232a33;
	backdrop-filter: blur(4px);
	opacity: 0;
	transition: opacity calc(220ms * var(--modal-motion-scale));
}
dialog[open]:not(.closing)::backdrop {
	opacity: 1;
}
/* Mirrors the open selectors' specificity, or they would override the starting values. */
@starting-style {
	dialog.sheet[open]:not(.closing) {
		transform: translateY(105%);
	}
	dialog[open]:not(.closing) {
		opacity: 0;
		transform: translateY(8px) scale(0.98);
	}
	dialog[open]:not(.closing)::backdrop {
		opacity: 0;
	}
}
@media (prefers-reduced-motion: reduce) {
	dialog,
	dialog::backdrop {
		transition: none;
	}
}
</style>
