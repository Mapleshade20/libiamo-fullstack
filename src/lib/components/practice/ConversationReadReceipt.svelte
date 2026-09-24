<script lang="ts">
import { base } from "$app/paths";

let { receipt }: { receipt: { sessionId: number; messageId: number } | null } = $props();

// Effects run only after mounting, never during speculative route loading.
$effect(() => {
	const snapshot = receipt;
	if (!snapshot) return;
	const controller = new AbortController();
	let sent = false;
	async function acknowledge() {
		if (sent || document.visibilityState !== "visible") return;
		sent = true;
		try {
			const response = await fetch(`${base}/api/unread`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(snapshot),
				signal: controller.signal,
			});
			if (!response.ok) sent = false;
		} catch {
			sent = false;
		}
	}
	void acknowledge();
	document.addEventListener("visibilitychange", acknowledge);
	return () => {
		controller.abort();
		document.removeEventListener("visibilitychange", acknowledge);
	};
});
</script>
