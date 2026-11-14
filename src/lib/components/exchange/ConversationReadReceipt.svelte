<script lang="ts">
import { untrack } from "svelte";

/* The latest reply has been seen: the page says so once it is visible (effects never run during a speculative load). */
let { exchangeId, messageId, read }: { exchangeId: number | null; messageId: number | null; read: (messageId: number) => Promise<void> } = $props();

$effect(() => {
	if (exchangeId === null || messageId === null) return;
	const id = messageId;
	let sent = false;
	function acknowledge() {
		if (sent || document.visibilityState !== "visible") return;
		sent = true;
		// A command is sent from outside the effect, so nothing it changes re-runs it.
		setTimeout(() => untrack(() => read(id)).catch(() => (sent = false)), 0);
	}
	acknowledge();
	document.addEventListener("visibilitychange", acknowledge);
	return () => document.removeEventListener("visibilitychange", acknowledge);
});
</script>
