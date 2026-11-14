<script lang="ts">
import { toastState } from "$lib/demo/app.svelte";

/* A quiet word after an action: rises in with a fade, a blur and a scale (transitions.dev "Toast"), leaves by itself. */
let on = $state(false);
let msg = $state("");
$effect(() => {
	if (!toastState.n) return;
	msg = toastState.msg;
	on = true;
	const t = setTimeout(() => (on = false), 2200);
	return () => clearTimeout(t);
});
</script>

<div class="toast" class:on role="status">{msg}</div>

<style>
.toast {
	position: fixed;
	left: calc(var(--side) + (100vw - var(--side)) / 2);
	bottom: max(28px, env(safe-area-inset-bottom));
	z-index: 90;
	translate: -50% 0;
	max-width: min(440px, calc(100vw - 32px));
	padding: 10px 16px;
	border-radius: 6px;
	background: var(--ink);
	color: var(--bg);
	font-size: 14px;
	pointer-events: none;
	opacity: 0;
	transform: translateY(10px) scale(0.96);
	filter: blur(4px);
	transition:
		opacity 150ms var(--ease-panel),
		transform 150ms var(--ease-panel),
		filter 150ms var(--ease-panel);
	view-transition-name: toast;
}
.toast.on {
	opacity: 1;
	transform: none;
	filter: none;
	transition-duration: 300ms;
}
</style>
