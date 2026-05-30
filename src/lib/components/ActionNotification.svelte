<script lang="ts">
import ResponsiveNotification from "$lib/components/ResponsiveNotification.svelte";
import type { ActionNotificationContent } from "$lib/notifications";

interface Props {
	notification?: ActionNotificationContent | null;
	durationMs?: number;
}

let { notification = null, durationMs = 4000 }: Props = $props();

let isOpen = $state(false);
let activeKey = $state("");

$effect(() => {
	const nextKey = notification ? `${notification.variant}:${notification.title ?? ""}:${notification.message}:${notification.key ?? ""}` : "";
	if (!nextKey) {
		isOpen = false;
		activeKey = "";
		return;
	}
	if (nextKey !== activeKey) {
		activeKey = nextKey;
		isOpen = true;
	}
});
</script>

<ResponsiveNotification
	open={isOpen}
	variant={notification?.variant ?? "info"}
	title={notification?.title}
	message={notification?.message ?? ""}
	{durationMs}
	onClose={() => (isOpen = false)}
/>
