<script lang="ts">
/* A person's disc in the session: the tutor's pen, the reader's open book, the learner's figure. */
let { icon, color }: { icon: string; color: string } = $props();
</script>

<span class="ic" style:--who={color} aria-hidden="true">
	{#if icon === "pen"}
		<svg viewBox="0 0 24 24" aria-hidden="true">
			<path d="M15.4 3.8a2 2 0 0 1 2.8 0l2 2a2 2 0 0 1 0 2.8L8.8 20 3.3 21.2l1.2-5.5z" fill="currentColor" />
		</svg>
	{:else if icon === "reader"}
		<svg viewBox="0 0 24 24" aria-hidden="true">
			<path
				d="M2.5 5.6c2.9-1.5 6.2-1.4 8.8.5v13.6c-2.6-1.7-5.9-1.8-8.8-.5zM21.5 5.6c-2.9-1.5-6.2-1.4-8.8.5v13.6c2.6-1.7 5.9-1.8 8.8-.5z"
				fill="currentColor"
			/>
		</svg>
	{:else}
		<svg viewBox="0 0 24 24" aria-hidden="true">
			<circle cx="12" cy="8.2" r="4.2" fill="currentColor" />
			<path d="M3.8 20.6c0-4.2 3.7-7.1 8.2-7.1s8.2 2.9 8.2 7.1z" fill="currentColor" />
		</svg>
	{/if}
</span>

<style>
.ic {
	width: 28px;
	height: 28px;
	border-radius: 50%;
	display: grid;
	place-items: center;
	flex: none;
	color: var(--on-who);
	background: var(--who, var(--ink));
}
.ic svg {
	width: 16px;
	height: 16px;
	display: block;
}
</style>
