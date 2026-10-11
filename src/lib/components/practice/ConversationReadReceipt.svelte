<script lang="ts">
import { invalidate } from "$app/navigation";
import { base } from "$app/paths";
import { PRACTICE_SESSION_DEPENDENCY } from "$lib/app/load-dependencies";

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
			if (!response.ok) {
				sent = false;
				return;
			}
			// Reading may have resumed ambient life (a world moment): refresh the session so its
			// polling plan picks up the new work instead of staying stopped.
			const payload = (await response.json().catch(() => null)) as { worldScheduled?: boolean } | null;
			if (payload?.worldScheduled) await invalidate(PRACTICE_SESSION_DEPENDENCY);
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
