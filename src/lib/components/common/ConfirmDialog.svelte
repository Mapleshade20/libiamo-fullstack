<script lang="ts">
import type { Snippet } from "svelte";
import { Button } from "$lib/components/ui/button";
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
	tone = "danger",
	onconfirm,
	children,
}: {
	open?: boolean;
	title: string;
	message?: string;
	confirmLabel: string;
	cancelLabel: string;
	/** Keeps the dialog up, and both buttons inert, while the action is in flight. */
	busy?: boolean;
	/** `danger` for deleting, removing and disconnecting; `default` for anything else. */
	tone?: "danger" | "default";
	onconfirm: () => void;
	/** Detail below the message, such as a summary of what is about to be submitted. */
	children?: Snippet;
} = $props();

const titleId = $props.id();
</script>

<ModalDialog bind:open={isOpen} {busy} labelledby={titleId}>
	<div aria-busy={busy}>
		<h2 id={titleId} class="mb-2">{title}</h2>
		{#if message}
			<p class="mb-6 text-sm leading-relaxed text-muted-foreground">{message}</p>
		{/if}
		{#if children}
			<div class="mb-6 text-sm leading-relaxed text-muted-foreground">{@render children()}</div>
		{/if}
		<div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
			<Button variant="secondary" disabled={busy} onclick={() => (isOpen = false)}>{cancelLabel}</Button>
			<Button variant={tone === "danger" ? "destructive-solid" : "default"} disabled={busy} onclick={onconfirm}>{confirmLabel}</Button>
		</div>
	</div>
</ModalDialog>
