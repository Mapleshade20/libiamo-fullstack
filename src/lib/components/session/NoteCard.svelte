<script lang="ts">
import { onMount } from "svelte";
import TwoStep from "$lib/components/common/TwoStep.svelte";
import Button from "$lib/components/ui/button/button.svelte";
import Speaker from "./Speaker.svelte";

/* The tutor's note on a mark, and the way on. `keepable`: the learner may keep what they wrote (a change they know is
   wrong for their purpose, a canon name), which takes the suggestion back. */
let {
	who,
	icon,
	text,
	keepable = false,
	labels,
	done,
}: {
	who: { name: string; color: string };
	icon: string;
	text: string;
	keepable?: boolean;
	labels: { cont: string; keep: string; keepSure: string };
	done: (v: "continue" | "keep") => void;
} = $props();
let btn: HTMLButtonElement | null = $state(null);
onMount(() => btn?.focus({ preventScroll: true }));
</script>

<div class="p1-card" style:--who={who.color}>
	<Speaker {who} {icon}>{text}</Speaker>
	<div class="p1-actions">
		<Button bind:ref={btn} variant="secondary" size="sm" onclick={() => done("continue")}>{labels.cont}</Button>
		{#if keepable}
			<span class="p1-links"><TwoStep class="p1-link" label={labels.keep} confirm={labels.keepSure} onconfirm={() => done("keep")} /></span>
		{/if}
	</div>
</div>
