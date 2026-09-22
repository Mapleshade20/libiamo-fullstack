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
		element.close();
	}
});
</script>

<dialog
	bind:this={dialog}
	class:sheet={variant === "sheet"}
	aria-labelledby={labelledby}
	style="--modal-motion-scale: {motionScale}"
	oncancel={(event) => { if (busy) event.preventDefault(); }}
	onmousedown={(event) => { pressedBackdrop = event.target === dialog; }}
	onclick={(event) => { if (lightDismiss && !busy && pressedBackdrop && event.target === dialog) isOpen = false; }}
	onclose={() => {
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
		transform calc(220ms * var(--modal-motion-scale)) cubic-bezier(0.22, 1, 0.36, 1),
		display calc(220ms * var(--modal-motion-scale)) allow-discrete,
		overlay calc(220ms * var(--modal-motion-scale)) allow-discrete;
}
dialog[open] {
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
dialog.sheet[open] {
	transform: none;
}
dialog::backdrop {
	background: #28232a33;
	backdrop-filter: blur(4px);
	opacity: 0;
	transition:
		opacity calc(220ms * var(--modal-motion-scale)),
		display calc(220ms * var(--modal-motion-scale)) allow-discrete,
		overlay calc(220ms * var(--modal-motion-scale)) allow-discrete;
}
dialog[open]::backdrop {
	opacity: 1;
}
@starting-style {
	dialog.sheet[open] {
		transform: translateY(105%);
	}
	dialog[open] {
		opacity: 0;
		transform: translateY(8px) scale(0.98);
	}
	dialog[open]::backdrop {
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
