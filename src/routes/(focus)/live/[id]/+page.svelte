<script lang="ts">
import LivePage from "#lib/components/session/LivePage.svelte";

let { data } = $props();
</script>

<!-- One revision per piece: another piece is another page, never this one's state carried over. -->
{#key data.id}
	<LivePage id={data.id} setup={data.setup} resumed={data.resumed} />
{/key}
