<script lang="ts">
import FinishSheet from "$lib/components/practice/session/FinishSheet.svelte";
import { normalizeText } from "$lib/components/practice/session/message-format";
import { createPracticeSession, type PracticeSurfaceProps } from "$lib/components/practice/session/session.svelte";
import UnavailableNotice from "$lib/components/practice/session/UnavailableNotice.svelte";
import { createMemberPool, type DiscordMember } from "$lib/practice/discord-members";
import { resolveScene } from "$lib/practice/scene";
import ChatHeader from "./ChatHeader.svelte";
import { hasAgentStartedComposing } from "./helpers";
import { i18n } from "./i18n";
import MemberList from "./MemberList.svelte";
import MessageInput from "./MessageInput.svelte";
import MessageStream from "./MessageStream.svelte";
import MobileTopBar from "./MobileTopBar.svelte";
import Sidebar from "./Sidebar.svelte";

let props: PracticeSurfaceProps = $props();

const t = $derived(i18n[props.language] ?? i18n.en);
const pool = $derived(createMemberPool(props.taskId));
const scene = $derived(resolveScene("discord", props.openingState, props.taskId, props.userName));
const session = createPracticeSession(() => props, { agentName: () => scene.counterpart.name });
const opening = $derived((props.openingState ?? {}) as { serverName?: string; channelName?: string });
const serverName = $derived(normalizeText(opening.serverName, `${props.userName}'s Server`));
const dm = $derived(!scene.group);
const channelName = $derived(dm ? scene.counterpart.name : normalizeText(opening.channelName, t.general));
const agent = $derived<DiscordMember>({ ...pool.agent, name: session.agentName });
// Everyone who can post is online: the cast, and anyone new who joined the channel.
const online = $derived(
	[
		...new Set([
			...scene.cast.slice(1).map((person) => person.name),
			...session.messages.flatMap((message) => (message.role === "agent" ? [message.authorName] : [])),
		]),
	]
		.filter((name) => name !== agent.name)
		.map((name) => pool.online.find((member) => member.name === name) ?? { name, status: "" }),
);

// Real Discord typing means the person is composing: the indicator appears only once the worker
// has claimed the reply batch (read watermark advanced), not the moment the learner sends.
const agentComposing = $derived(hasAgentStartedComposing(session.messages, session.agentReadUpToMessageId));

let inputText = $state("");
let showMobileMenu = $state(false);
let showMembers = $state(false);
let mentionMenu = $state<{ x: number; y: number; member: DiscordMember } | null>(null);
let notice = $state<UnavailableNotice>();

function mention(member: DiscordMember) {
	const space = inputText === "" || inputText.endsWith(" ") ? "" : " ";
	inputText += `${space}@${member.name} `;
	mentionMenu = null;
}
</script>

<svelte:window onclick={() => (mentionMenu = null)} />

<div
	class="practice-surface fixed inset-0 z-[999] flex h-[100dvh] w-full flex-col overflow-hidden bg-[#313338] font-inter-stack text-gray-200 selection:bg-[#5865F2] selection:text-white md:flex-row"
>
	<UnavailableNotice bind:this={notice} language={props.language} class="border border-[#1E1F22] bg-[#111214] text-white" />

	{#if mentionMenu}
		<div
			class="fixed z-[1000] w-48 rounded border border-[#1E1F22] bg-[#111214] py-1 text-sm text-[#DBDEE1] shadow-lg"
			style:top="{mentionMenu.y}px"
			style:left="{mentionMenu.x}px"
		>
			<button
				type="button"
				class="w-full px-3 py-1.5 text-left transition-colors hover:bg-[#5865F2] hover:text-white"
				onclick={() => mentionMenu && mention(mentionMenu.member)}
			>
				{t.mention.replace("{name}", mentionMenu.member.name)}
			</button>
		</div>
	{/if}

	<MobileTopBar {serverName} menuLabel={t.channels} onToggleMenu={() => (showMobileMenu = !showMobileMenu)} />

	<Sidebar
		{serverName}
		{channelName}
		{dm}
		userName={props.userName}
		avatarUrl={props.avatarUrl}
		returnHref={props.returnHref}
		language={props.language}
		{showMobileMenu}
		{t}
		onCloseMobileMenu={() => (showMobileMenu = false)}
		onMockAction={() => notice?.show()}
	/>

	<div class="relative flex min-h-0 min-w-0 flex-1 flex-col bg-[#313338]">
		<ChatHeader
			{session}
			{channelName}
			{dm}
			language={props.language}
			{showMembers}
			membersLabel={t.members}
			onToggleMembers={() => (showMembers = !showMembers)}
		/>

		<div class="relative flex flex-1 overflow-hidden">
			<div class="relative flex min-w-0 flex-1 flex-col">
				<MessageStream
					{session}
					avatarUrl={props.avatarUrl}
					language={props.language}
					{t}
					isTyping={(session.isTyping && agentComposing) || session.hasPendingReveals}
				/>
				<MessageInput
					bind:inputText
					{session}
					language={props.language}
					placeholder={t.messagePlaceholder.replace("{channel}", `${dm ? "@" : "#"}${channelName}`)}
					members={dm ? [agent] : [agent, ...online, ...pool.offline]}
					{t}
				/>
			</div>

			{#if showMembers && !dm}
				<MemberList
					{agent}
					{online}
					offline={pool.offline}
					userName={props.userName}
					avatarUrl={props.avatarUrl}
					{t}
					onClose={() => (showMembers = false)}
					onMention={(event, member) => {
						event.preventDefault();
						// Keyboard activation has no pointer position; open beside the row instead.
						const row = (event.currentTarget as HTMLElement).getBoundingClientRect();
						mentionMenu = { x: event.clientX || row.left, y: event.clientY || row.bottom, member };
					}}
				/>
			{/if}
		</div>
	</div>

	<FinishSheet {session} language={props.language} />
</div>

<style>
::-webkit-scrollbar {
	width: 8px;
	height: 8px;
}
::-webkit-scrollbar-thumb {
	background: #1a1b1e;
	border-radius: 4px;
}
:global(.markdown-wrapper p) {
	margin: 0;
	display: inline;
}
</style>
