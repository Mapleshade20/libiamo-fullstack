<script lang="ts">
import { dev } from "$app/environment";
import NameTables from "$lib/components/admin/NameTables.svelte";
import FocusBar from "$lib/components/shell/FocusBar.svelte";
</script>

<FocusBar exit={{ label: "Home", href: "/" }} />
<main class="names">
	<h1>Name tables</h1>
	<p class="lede">
		How each name and term is written in a translation scenario's source, per work and learner language. Only confirmed rows are used; a pending row
		is written as in the original.
	</p>
	{#if !dev}
		<p>Dev only.</p>
	{/if}
	<NameTables />
</main>

<style>
.names {
	width: min(980px, 100% - 40px);
	margin: 0 auto;
	padding: clamp(8px, 3vh, 28px) 0 96px;
}
h1 {
	font-size: clamp(26px, 3.4vw, 34px);
	margin: 0 0 6px;
}
.lede {
	margin: 0 0 26px;
	color: var(--ink-2);
	font-size: 15px;
	max-width: 680px;
}
</style>
