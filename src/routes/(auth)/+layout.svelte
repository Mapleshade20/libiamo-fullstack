<script lang="ts">
let { children } = $props();
</script>

<svelte:head> <meta name="robots" content="noindex, follow"> </svelte:head>

<div class="flex min-h-screen items-center justify-center px-4">
	<div class="w-full max-w-md space-y-8">
		<div class="text-center">
			<h1 class="text-3xl tracking-tight">Libiamo</h1>
			<p class="mt-1 text-sm text-muted-foreground">Language through living conversation</p>
		</div>
		{@render children()}
	</div>
</div>
