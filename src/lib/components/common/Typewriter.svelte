<script lang="ts">
import { onMount } from "svelte";

let { text }: { text: string } = $props();
let count = $state(0);
onMount(() => {
	if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
	const timer = setInterval(() => {
		count += 1;
		if (count >= Array.from(text).length) clearInterval(timer);
	}, 28);
	return () => clearInterval(timer);
});
</script>
<span class="typewriter" aria-label={text}
	><span class="reserve" aria-hidden="true">{text}</span
	><span class="typed" aria-hidden="true">{Array.from(text).slice(0, count).join('')}</span></span
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
@media (prefers-reduced-motion: reduce), (scripting: none) {
	.reserve {
		visibility: visible;
	}
	.typed {
		visibility: hidden;
	}
}
</style>
