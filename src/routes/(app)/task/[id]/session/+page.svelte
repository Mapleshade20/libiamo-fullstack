<script lang="ts">
import AO3UI from "$lib/components/practice-ui/ao3/AO3UI.svelte";
import DiscordUI from "$lib/components/practice-ui/discord/DiscordUI.svelte";
import IMessageUI from "$lib/components/practice-ui/imessage/IMessageUI.svelte";
import MailUI from "$lib/components/practice-ui/mail/MailUI.svelte";
import RedditUI from "$lib/components/practice-ui/reddit/RedditUI.svelte";

let { data } = $props();
</script>

{#if data.task.template.ui === "discord"}
	<DiscordUI
		taskId={data.taskId}
		userName={data.user.name}
		avatarUrl={data.user.avatarUrl}
		language={data.user.learningLanguage}
		timeZone={data.user.timezone}
		existingSession={data.existingSession}
		openingState={data.task.variant?.openingState}
		maxTurns={data.task.template.maxTurns ?? 0}
		agentStartsFirst={data.agentStartsFirst}
	/>
{:else if data.task.template.ui === "imessage"}
	<IMessageUI
		taskId={data.taskId}
		userName={data.user.name}
		avatarUrl={data.user.avatarUrl}
		language={data.user.learningLanguage}
		timeZone={data.user.timezone}
		existingSession={data.existingSession}
		openingState={data.task.variant?.openingState}
		maxTurns={data.task.template.maxTurns ?? 0}
		agentStartsFirst={data.agentStartsFirst}
	/>
{:else if data.task.template.ui === "apple_mail"}
	<MailUI
		taskId={data.taskId}
		userName={data.user.name}
		avatarUrl={data.user.avatarUrl}
		language={data.user.learningLanguage}
		timeZone={data.user.timezone}
		existingSession={data.existingSession}
		openingState={data.task.variant?.openingState}
		maxTurns={data.task.template.maxTurns ?? 0}
		agentStartsFirst={data.agentStartsFirst}
	/>
{:else if data.task.template.ui === "ao3"}
	<AO3UI
		taskId={data.taskId}
		userName={data.user.name}
		avatarUrl={data.user.avatarUrl}
		language={data.user.learningLanguage}
		existingSession={data.existingSession}
		openingState={data.task.variant?.openingState}
		maxTurns={data.task.template.maxTurns ?? 0}
		agentStartsFirst={data.agentStartsFirst}
	/>
{:else if data.task.template.ui === "reddit"}
	<RedditUI
		taskId={data.taskId}
		userName={data.user.name}
		avatarUrl={data.user.avatarUrl}
		language={data.user.learningLanguage}
		existingSession={data.existingSession}
		openingState={data.task.variant?.openingState}
		maxTurns={data.task.template.maxTurns ?? 0}
		agentStartsFirst={data.agentStartsFirst}
	/>
{:else}
	<div class="flex h-screen items-center justify-center bg-background">
		<p class="text-muted-foreground text-sm uppercase tracking-widest">{data.task.template.ui} interface not yet implemented</p>
	</div>
{/if}
