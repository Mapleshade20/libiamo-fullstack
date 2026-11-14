<script lang="ts">
import Button from "#lib/components/ui/button/button.svelte";
import Speaker from "./Speaker.svelte";

/* A choice the draft left open (the options stand in the post too, and answer the same way). */
let {
	who,
	icon,
	text,
	options,
	done,
}: { who: { name: string; color: string }; icon: string; text: string; options: string[]; done: (i: number) => void } = $props();
</script>

<div class="p1-card" style:--who={who.color}>
	<Speaker {who} {icon}>{text}</Speaker>
	<div class="p1-actions">
		{#each options as o, i}
			<Button variant="secondary" onclick={() => done(i)}>{o}</Button>
		{/each}
	</div>
</div>
