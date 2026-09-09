<script lang="ts">
import { onMount } from "svelte";
import { base } from "$app/paths";
import { getQuestHallWorkflowReturnHref } from "$lib/client/quest-hall/return-context";
import AO3UI from "$lib/components/practice-ui/ao3/AO3UI.svelte";
import DiscordUI from "$lib/components/practice-ui/discord/DiscordUI.svelte";
import IMessageUI from "$lib/components/practice-ui/imessage/IMessageUI.svelte";
import MailUI from "$lib/components/practice-ui/mail/MailUI.svelte";
import RedditUI from "$lib/components/practice-ui/reddit/RedditUI.svelte";
import type { LanguageCode } from "$lib/constants";

let { data } = $props();
// svelte-ignore state_referenced_locally
let detailsHref = $state(`${base}/task/${data.taskId}`);

onMount(() => {
	detailsHref = getQuestHallWorkflowReturnHref({
		destination: "details",
		accountScope: data.accountScope,
		activeLanguage: data.user.activeLanguage as LanguageCode,
		edition: data.questHallEdition,
		item: { kind: "quest", id: Number(data.taskId) },
		base,
		fallbackHref: detailsHref,
	});
});
</script>

<svelte:head>
	<title>{data.task.title} · Practice · Libiamo</title>
	<meta name="description" content={`Practice “${data.task.title}” in an interactive simulated conversation.`}>
</svelte:head>

{#if data.task.template.ui === "discord"}
	<DiscordUI
		taskId={data.taskId}
		userName={data.user.name}
		avatarUrl={data.avatarUrl}
		language={data.task.language}
		existingSession={data.existingSession}
		openingState={data.task.variant?.openingState}
		maxTurns={data.maxTurns}
		returnHref={detailsHref}
	/>
{:else if data.task.template.ui === "imessage"}
	<IMessageUI
		taskId={data.taskId}
		userName={data.user.name}
		avatarUrl={data.avatarUrl}
		language={data.task.language}
		existingSession={data.existingSession}
		openingState={data.task.variant?.openingState}
		maxTurns={data.maxTurns}
		returnHref={detailsHref}
	/>
{:else if data.task.template.ui === "apple_mail"}
	<MailUI
		taskId={data.taskId}
		userName={data.user.name}
		avatarUrl={data.avatarUrl}
		language={data.task.language}
		existingSession={data.existingSession}
		openingState={data.task.variant?.openingState}
		maxTurns={data.maxTurns}
		returnHref={detailsHref}
	/>
{:else if data.task.template.ui === "ao3"}
	<AO3UI
		taskId={data.taskId}
		userName={data.user.name}
		avatarUrl={data.avatarUrl}
		language={data.task.language}
		existingSession={data.existingSession}
		openingState={data.task.variant?.openingState}
		maxTurns={data.maxTurns}
		returnHref={detailsHref}
	/>
{:else if data.task.template.ui === "reddit"}
	<RedditUI
		taskId={data.taskId}
		userName={data.user.name}
		avatarUrl={data.avatarUrl}
		language={data.task.language}
		existingSession={data.existingSession}
		openingState={data.task.variant?.openingState}
		maxTurns={data.maxTurns}
		returnHref={detailsHref}
	/>
{:else}
	<div class="flex h-screen items-center justify-center bg-background">
		<p class="text-muted-foreground text-sm uppercase tracking-widest">{data.task.template.ui} interface not yet implemented</p>
	</div>
{/if}
