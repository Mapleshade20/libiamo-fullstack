<script lang="ts">
import ModalDialog from "./ModalDialog.svelte";

/**
 * A second look before something that is awkward to undo. Cancel comes first in
 * the markup so `showModal()` lands the focus there: pressing Enter out of habit
 * backs out instead of going through with it.
 */
let {
	open: isOpen = $bindable(false),
	title,
	message,
	confirmLabel,
	cancelLabel,
	busy = false,
	onconfirm,
}: {
	open?: boolean;
	title: string;
	message: string;
	confirmLabel: string;
	cancelLabel: string;
	/** Keeps the dialog up, and both buttons inert, while the action is in flight. */
	busy?: boolean;
	onconfirm: () => void;
} = $props();

const titleId = $props.id();
</script>

<ModalDialog bind:open={isOpen} {busy} labelledby={titleId}>
	<div aria-busy={busy}>
		<h2 id={titleId}>{title}</h2>
		<p class="message">{message}</p>
		<div class="actions">
			<button type="button" disabled={busy} onclick={() => (isOpen = false)}>{cancelLabel}</button>
			<button type="button" class="confirm-action" disabled={busy} onclick={onconfirm}>{confirmLabel}</button>
		</div>
	</div>
</ModalDialog>

<style>
h2 {
	margin: 0 0 1rem;
	font-family: var(--font-serif);
	font-size: 1.75rem;
	font-weight: 500;
}
.message {
	margin: 0 0 1.75rem;
	font-size: 0.9rem;
	line-height: 1.6;
	color: #655d55;
}
.actions {
	display: flex;
	justify-content: flex-end;
	gap: 0.75rem;
}
.actions button {
	min-height: 44px;
	padding: 0.65rem 1rem;
	border-radius: 10px;
	font-size: 0.875rem;
	font-weight: 600;
	transition:
		background-color 200ms,
		opacity 200ms;
}
.actions button:hover {
	background: #eeeae4;
}
.actions .confirm-action {
	background: #713b46;
	color: #fffaf7;
}
.actions .confirm-action:hover {
	background: #60323c;
}
.actions button:disabled {
	opacity: 0.5;
	cursor: default;
}
button:focus-visible {
	outline: 2px solid #89525e;
	outline-offset: 3px;
}
@media (prefers-reduced-motion: reduce) {
	.actions button {
		transition: none;
	}
}
</style>
