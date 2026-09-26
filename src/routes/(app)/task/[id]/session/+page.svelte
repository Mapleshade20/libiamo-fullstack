<script lang="ts">
import type { Component } from "svelte";
import { base } from "$app/paths";
import { page } from "$app/state";
import ConversationReadReceipt from "$lib/components/practice/ConversationReadReceipt.svelte";
import type { PracticeSurfaceProps } from "$lib/components/practice/session/session.svelte";
import AO3UI from "$lib/components/practice/ui/ao3/AO3UI.svelte";
import DiscordUI from "$lib/components/practice/ui/discord/DiscordUI.svelte";
import IMessageUI from "$lib/components/practice/ui/imessage/IMessageUI.svelte";
import MailUI from "$lib/components/practice/ui/mail/MailUI.svelte";
import RedditUI from "$lib/components/practice/ui/reddit/RedditUI.svelte";
import type { ChatUiVariant } from "$lib/constants";
import { lineupQuery } from "$lib/task/attempts";

const SURFACES: Record<ChatUiVariant, Component<PracticeSurfaceProps>> = {
	discord: DiscordUI,
	imessage: IMessageUI,
	apple_mail: MailUI,
	ao3: AO3UI,
	reddit: RedditUI,
};

let { data } = $props();
const Surface = $derived(SURFACES[data.task.ui as ChatUiVariant]);
// Links keep a pinned `?lineup=`, so feedback and details show the same attempt as this page.
const pin = $derived(lineupQuery(page.url));
</script>

<ConversationReadReceipt receipt={data.readReceipt} />

<svelte:head>
	<title>{data.task.title} · Practice · Libiamo</title>
	<meta name="description" content={`Practice “${data.task.title}” in an interactive simulated conversation.`}>
</svelte:head>

<!-- Another attempt is another conversation: never carry one surface's local state into the next. -->
{#key `${data.taskId}${pin}`}
	<Surface
		taskId={data.taskId}
		userName={data.user.name}
		avatarUrl={data.avatarUrl}
		language={data.task.language}
		session={data.session}
		openingState={data.task.openingState}
		maxTurns={data.maxTurns}
		returnHref={`${base}/task/${data.taskId}${pin}`}
		feedbackHref={`${base}/task/${data.taskId}/feedback${pin}`}
	/>
{/key}
