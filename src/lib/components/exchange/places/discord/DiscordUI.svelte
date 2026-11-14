<script lang="ts">
import { createExchange, type SurfaceProps } from "#lib/components/exchange/controller.svelte.ts";
import FinishSheet from "#lib/components/exchange/FinishSheet.svelte";
import { normalizeText } from "#lib/components/exchange/message-format.ts";
import SendRejectedNotice from "#lib/components/exchange/SendRejectedNotice.svelte";
import UnavailableNotice from "#lib/components/exchange/UnavailableNotice.svelte";
import { createMemberPool, type DiscordMember } from "#lib/exchange/discord-members.ts";
import type { ChatMessage } from "#lib/exchange/messages.ts";
import { resolveScene } from "#lib/exchange/scene.ts";
import ChatHeader from "./ChatHeader.svelte";
import { hasAgentStartedComposing } from "./helpers.ts";
import { i18n } from "./i18n.ts";
import MemberList from "./MemberList.svelte";
import MessageInput from "./MessageInput.svelte";
import MessageStream from "./MessageStream.svelte";
import MobileTopBar from "./MobileTopBar.svelte";
import Sidebar from "./Sidebar.svelte";

let props: SurfaceProps = $props();

const t = $derived(i18n[props.language] ?? i18n.en);
const pool = $derived(createMemberPool(props.scenarioId));
const scene = $derived(resolveScene("discord", props.openingState, props.scenarioId, props.userName));
const exchange = createExchange(() => props, { agentName: () => scene.counterpart.name });
const opening = $derived((props.openingState ?? {}) as { serverName?: string; channelName?: string });
const serverName = $derived(normalizeText(opening.serverName, `${props.userName}'s Server`));
const dm = $derived(!scene.group);
const channelName = $derived(dm ? scene.counterpart.name : normalizeText(opening.channelName, t.general));
const agent = $derived<DiscordMember>({ ...pool.agent, name: exchange.agentName });
// Everyone who can post is online: the cast, and anyone new who joined the channel.
const online = $derived(
	[
		...new Set([
			...scene.cast.slice(1).map((person) => person.name),
			...exchange.messages.flatMap((message) => (message.role === "agent" ? [message.authorName] : [])),
		]),
	]
		.filter((name) => name !== agent.name)
		.map((name) => pool.online.find((member) => member.name === name) ?? { name, status: "" }),
);

// Real Discord typing means the person is composing: the indicator appears only once the worker
// has claimed the reply batch (read watermark advanced), not the moment the learner sends.
const agentComposing = $derived(hasAgentStartedComposing(exchange.messages, exchange.agentReadUpToMessageId));

const members = $derived(dm ? [agent] : [agent, ...online, ...pool.offline]);
const mentionNames = $derived([props.userName, ...members.map((member) => member.name)]);

let inputText = $state("");
let replyingTo = $state<ChatMessage | null>(null);
let textarea = $state<HTMLTextAreaElement>();
let showMobileMenu = $state(false);
let showMembers = $state(false);
let mentionMenu = $state<{ x: number; y: number; member: DiscordMember } | null>(null);
let notice = $state<UnavailableNotice>();

function mention(member: DiscordMember) {
	const space = inputText === "" || inputText.endsWith(" ") ? "" : " ";
	inputText += `${space}@${member.name} `;
	mentionMenu = null;
	textarea?.focus({ preventScroll: true });
}

function reply(message: ChatMessage) {
	replyingTo = message;
	textarea?.focus({ preventScroll: true });
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
			{exchange}
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
					{exchange}
					avatarUrl={props.avatarUrl}
					userName={props.userName}
					language={props.language}
					{t}
					isTyping={(exchange.isTyping && agentComposing) || exchange.hasPendingReveals}
					{mentionNames}
					{replyingTo}
					onReply={reply}
				/>
				<MessageInput
					bind:inputText
					bind:replyingTo
					bind:textarea
					{exchange}
					language={props.language}
					placeholder={t.messagePlaceholder.replace("{channel}", `${dm ? "@" : "#"}${channelName}`)}
					{members}
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

	<FinishSheet {exchange} language={props.language} />
	<SendRejectedNotice {exchange} language={props.language} />
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
:global(.markdown-wrapper .discord-mention) {
	border-radius: 3px;
	padding: 0 2px;
	background: rgb(88 101 242 / 0.3);
	color: #c9cdfb;
	font-weight: 500;
}
</style>
