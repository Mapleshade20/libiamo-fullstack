<script lang="ts">
import Info from "@lucide/svelte/icons/info";
import { Tooltip } from "bits-ui";
import { cn } from "$lib/utils";

/*
 * A small ⓘ beside a label whose note extends to its right on hover or keyboard focus.
 * Touch has no hover, so a tap toggles it and tapping elsewhere closes it. Give the
 * described control `aria-describedby={id}`: a hidden copy of the note stays in the DOM, so
 * screen readers hear it from the field itself rather than having to find the icon.
 */
let { id, label, text, class: className }: { id: string; label: string; text: string; class?: string } = $props();

let shown = $state(false);
// Read at pointerdown: the focus that follows a tap opens the tip before the click lands.
let tapStartedOpen: boolean | null = null;
let trigger = $state<HTMLElement | null>(null);
// A modal `<dialog>` sits in the top layer, above anything portaled to `<body>`.
// It also clips its contents, so the note must fit inside it.
const dialog = $derived(trigger?.closest("dialog") ?? null);
</script>

<span {id} hidden>{text}</span>
<Tooltip.Provider delayDuration={150} disableCloseOnTriggerClick>
	<Tooltip.Root bind:open={shown}>
		<Tooltip.Trigger
			bind:ref={trigger}
			type="button"
			aria-label={label}
			class={cn(
				"inline-flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors duration-150 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:size-7",
				className,
			)}
			onpointerdown={(event) => (tapStartedOpen = event.pointerType === "mouse" ? null : shown)}
			onpointerleave={(event) => {
				// A finger "leaves" as soon as it lifts; only a tap elsewhere should close it.
				if (event.pointerType !== "mouse") event.preventDefault();
			}}
			onclick={() => {
				if (tapStartedOpen !== null) shown = !tapStartedOpen;
				tapStartedOpen = null;
			}}
		>
			<Info class="size-3.5" aria-hidden="true" />
		</Tooltip.Trigger>
		<Tooltip.Portal to={dialog ?? "body"}>
			<Tooltip.Content
				side="right"
				align="center"
				sideOffset={6}
				collisionPadding={12}
				collisionBoundary={dialog ?? undefined}
				class="info-tip z-[70] w-max max-w-[min(18rem,var(--bits-tooltip-content-available-width))] rounded-lg bg-popover px-3 py-2 text-xs leading-relaxed text-popover-foreground"
			>
				{text}
			</Tooltip.Content>
		</Tooltip.Portal>
	</Tooltip.Root>
</Tooltip.Provider>
