<script lang="ts">
import { onMount } from "svelte";

let { text }: { text: string } = $props();
let count = $state<number | null>(null);
onMount(() => {
	if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
	count = 0;
	const timer = setInterval(() => {
		count = (count ?? 0) + 1;
		if (count >= Array.from(text).length) clearInterval(timer);
	}, 28);
	return () => clearInterval(timer);
});
</script>
<span class="typewriter" aria-label={text}
	><span class="reserve" aria-hidden="true">{text}</span
	><span class="typed" aria-hidden="true">{count === null ? text : Array.from(text).slice(0, count).join('')}</span></span
>
<style>
.typewriter {
	display: grid;
}
.typewriter > span {
	grid-area: 1 / 1;
}
.reserve {
	visibility: hidden;
}
</style>
