<script lang="ts">
import DiscordUI from "$lib/components/practice-ui/DiscordUI.svelte";

let { data } = $props();
</script>

<svelte:head><title>Practice Session - Libiamo</title></svelte:head>

<DiscordUI
	taskId={data.taskId}
	userName={data.user.name}
	avatarUrl={data.user.avatarUrl}
	language={data.user.learningLanguage}
	existingSession={data.existingSession}
/>
