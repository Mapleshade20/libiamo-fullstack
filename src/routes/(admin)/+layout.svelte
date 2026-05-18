<script lang="ts">
import Navbar from "$lib/components/Navbar.svelte";

let { children, data } = $props();
</script>

<div class="min-h-screen">
	<Navbar mode="admin" user={data.user} pendingReviewCount={data.pendingReviewCount} />
	<main class="mx-auto max-w-6xl px-4 py-8 pt-24">{@render children()}</main>
</div>
