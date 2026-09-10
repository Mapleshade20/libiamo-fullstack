<script lang="ts">
import ResponsiveNotification from "$lib/components/ResponsiveNotification.svelte";
import type { ActionNotificationContent } from "$lib/notifications";

interface Props {
	notification?: ActionNotificationContent | null;
	durationMs?: number;
}

let { notification = null, durationMs = 4000 }: Props = $props();

let dismissedKey = $state<string | null>(null);
const activeKey = $derived(
	notification ? `${notification.variant}:${notification.title ?? ""}:${notification.message}:${notification.key ?? ""}` : "",
);
const isOpen = $derived(Boolean(activeKey) && activeKey !== dismissedKey);

$effect(() => {
	if (!notification) dismissedKey = null;
});
</script>

<ResponsiveNotification
	open={isOpen}
	variant={notification?.variant ?? "info"}
	title={notification?.title}
	message={notification?.message ?? ""}
	{durationMs}
	onClose={() => (dismissedKey = activeKey)}
/>
