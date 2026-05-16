<script lang="ts">
import DiscordUI from "$lib/components/practice-ui/discord/DiscordUI.svelte";
import MailUI from "$lib/components/practice-ui/mail/MailUI.svelte";

let { data } = $props();
</script>

{#if data.task.template.ui === "discord"}
	<DiscordUI
		taskId={data.taskId}
		userName={data.user.name}
		avatarUrl={data.user.avatarUrl}
		language={data.user.learningLanguage}
		existingSession={data.existingSession}
		openingState={data.task.variant?.openingState}
		maxTurns={data.task.template.maxTurns ?? 0}
		agentStartsFirst={data.agentStartsFirst}
	/>
{:else if data.task.template.ui === "imessage"}
	<div class="flex h-screen items-center justify-center bg-background">
		<p class="text-muted-foreground">iMessage UI is under construction...</p>
	</div>
{:else if data.task.template.ui === "apple_mail"}
	<MailUI
		taskId={data.taskId}
		userName={data.user.name}
		avatarUrl={data.user.avatarUrl}
		language={data.user.learningLanguage}
		existingSession={data.existingSession}
	/>
{:else}
	<div class="flex h-screen items-center justify-center bg-background">
		<p class="text-muted-foreground text-sm uppercase tracking-widest">{data.task.template.ui} interface not yet implemented</p>
	</div>
{/if}
