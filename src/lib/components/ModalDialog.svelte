<script lang="ts">
import type { Snippet } from "svelte";

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
	children,
}: {
	open?: boolean;
	/** Id of the heading inside `children` that names this dialog. */
	labelledby: string;
	/** While true, Escape is ignored — an in-flight request should not be abandoned halfway. */
	busy?: boolean;
	children: Snippet;
} = $props();

let dialog = $state<HTMLDialogElement | null>(null);
// Whatever opened the dialog gets the focus back, so keyboard users return to
// the button they pressed rather than to the top of the page.
let opener: HTMLElement | null = null;

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
	aria-labelledby={labelledby}
	oncancel={(event) => { if (busy) event.preventDefault(); }}
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
		opacity 220ms ease,
		transform 220ms cubic-bezier(0.22, 1, 0.36, 1),
		display 220ms allow-discrete,
		overlay 220ms allow-discrete;
}
dialog[open] {
	opacity: 1;
	transform: none;
}
dialog::backdrop {
	background: #28232a33;
	backdrop-filter: blur(4px);
	opacity: 0;
	transition:
		opacity 220ms,
		display 220ms allow-discrete,
		overlay 220ms allow-discrete;
}
dialog[open]::backdrop {
	opacity: 1;
}
@starting-style {
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
