<script lang="ts">
import { onDestroy } from "svelte";

/*
 * A choice that is hard to take back (keeping a slip in the text, leaving a part unrevised) asks once more, in place:
 * the first press turns the control into its question, the second does it. Left alone it turns back after a few
 * seconds; moving away (blur) turns it back at once. No dialog: the choice stays where the learner's hand is.
 */
let { label, confirm, onconfirm, class: cls = "" }: { label: string; confirm: string; onconfirm: () => void; class?: string } = $props();
let armed = $state(false);
let timer: ReturnType<typeof setTimeout> | undefined;
function press() {
	if (armed) {
		clearTimeout(timer);
		armed = false;
		onconfirm();
		return;
	}
	armed = true;
	clearTimeout(timer);
	timer = setTimeout(() => (armed = false), 3500);
}
onDestroy(() => clearTimeout(timer));
</script>

<button type="button" class="{cls} two-step" class:armed aria-live="polite" onclick={press} onblur={() => (armed = false)}>
	{armed ? confirm : label}
</button>

<style>
.two-step.armed {
	color: var(--tutor, var(--red));
	text-decoration-color: currentColor;
}
</style>
