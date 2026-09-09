<script lang="ts">
let { language }: { language: string } = $props();
</script>

<svg viewBox="0 0 30 22" width="24" height="18" aria-hidden="true" class="flag">
	<rect width="30" height="22" fill="#faf8f3" />
	{#if language === 'ja'}
		<circle cx="15" cy="11" r="6" fill="#b85159" />
	{:else if language === 'fr'}
		<path d="M0 0h10v22H0z" fill="#526984" />
		<path d="M20 0h10v22H20z" fill="#b85159" />
	{:else if language === 'es'}
		<path d="M0 0h30v22H0z" fill="#b85159" />
		<path d="M0 6h30v10H0z" fill="#e4bf73" />
	{:else}
		<path d="M0 0h30v22H0z" fill="#526984" />
		<path d="m0 0 30 22m0-22L0 22" stroke="#faf8f3" stroke-width="5" />
		<path d="M15 0v22M0 11h30" stroke="#faf8f3" stroke-width="8" />
		<path d="M15 0v22M0 11h30" stroke="#b85159" stroke-width="4" />
	{/if}
</svg>

<style>
.flag {
	border-radius: 4px;
	box-shadow: 0 0 0 1px #342e2814;
	flex-shrink: 0;
}
</style>
