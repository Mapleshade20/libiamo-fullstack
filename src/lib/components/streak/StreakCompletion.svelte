<script lang="ts">
import { getStreakPresentation } from "$lib/client/streak-presentation.svelte";

let { ready = true }: { ready?: boolean } = $props();
const presentation = getStreakPresentation();
$effect(() => {
	presentation.ready = ready;
	return () => {
		presentation.ready = false;
	};
});
</script>
