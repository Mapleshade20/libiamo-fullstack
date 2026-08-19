<script lang="ts">
import EmojiConvertor from "emoji-js";
import { onMount } from "svelte";
import { fade } from "svelte/transition";
import { BottomSheet } from "$lib/components/ui/bottom-sheet";
import { normalizeText } from "../../utils/messageUtils";
import { createPracticeSession } from "../session.svelte";
import ChatHeader from "./ChatHeader.svelte";
import { i18n } from "./i18n";
import MemberList from "./MemberList.svelte";
import MessageInput from "./MessageInput.svelte";
import MessageStream from "./MessageStream.svelte";
import MobileTopBar from "./MobileTopBar.svelte";
import Overlays from "./Overlays.svelte";
import Sidebar from "./Sidebar.svelte";
import { type ChatUser } from "./types";
import { initUserPool } from "./userPool";

interface Props {
	taskId?: string | number;
	userName?: string;
	avatarUrl?: string;
	language?: string;
	timeZone?: string;
	existingSession?: any;
	openingState?: unknown;
	maxTurns?: number;
}

let {
	taskId = "",
	userName = "Learner",
	avatarUrl = "",
	language = "en",
	timeZone = "UTC",
	existingSession = null,
	openingState = null,
	maxTurns = 0,
}: Props = $props();

const t = $derived(i18n[language as keyof typeof i18n] || i18n.en);
const sessionLabels = {
	get stillProcessingMessage() {
		return t.stillProcessingMessage;
	},
	get retryFailedMessage() {
		return t.retryFailedMessage;
	},
	get earlier() {
		return t.earlier;
	},
};

const session = createPracticeSession(() => ({
	userName,
	avatarUrl,
	language,
	existingSession,
	openingState,
	maxTurns,
	timeZone,
	labels: sessionLabels,
	taskId,
	onPoolInit(pool) {
		onlineUsers = pool.onlineUsers;
		offlineUsers = pool.offlineUsers;
	},
}));

const openingStateData = session.openingStateData;

const serverName = $derived(normalizeText(openingStateData.serverName, `${userName}'s Server`));
const channelName = $derived(normalizeText(openingStateData.channelName, t.general));
const messagePlaceholder = $derived(t.messagePlaceholder.replace("{channel}", channelName));
const serverAcronym = $derived(
	serverName
		.split(" ")
		.map((w) => w[0])
		.join("")
		.slice(0, 2)
		.toUpperCase(),
);
const emojiConv = new EmojiConvertor();
emojiConv.replace_mode = "unified";
emojiConv.allow_native = true;

let showMobileMenu = $state(false);
let onlineUsers = $state<ChatUser[]>([]);
let offlineUsers = $state<ChatUser[]>([]);
let allUsers = $derived([session.agentUser, ...onlineUsers, ...offlineUsers]);

let showToast = $state(false);
let toastTimeout: ReturnType<typeof setTimeout>;
let showMembers = $state(false);
let showFinishConfirm = $state(false);

let contextMenu = $state({
	show: false,
	x: 0,
	y: 0,
	targetUser: null as ChatUser | null,
});

function handleContextMenu(e: MouseEvent, user: ChatUser) {
	e.preventDefault();
	contextMenu = {
		show: true,
		x: e.clientX,
		y: e.clientY,
		targetUser: user,
	};
}

function handleContextMenuMention() {
	if (contextMenu.targetUser) {
		const space = session.inputText.endsWith(" ") || session.inputText === "" ? "" : " ";
		session.inputText += `${space}@${contextMenu.targetUser.name} `;
	}
	contextMenu.show = false;
}

function handleFinishClick() {
	showFinishConfirm = true;
}

function handleFinishConfirm() {
	showFinishConfirm = false;
	void session.handleCompleteAndNavigate(String(taskId));
}

function handleFinishCancel() {
	showFinishConfirm = false;
}

function handleWindowClick() {
	if (contextMenu.show) contextMenu.show = false;
}

function handleMockAction() {
	showToast = true;
	if (toastTimeout) clearTimeout(toastTimeout);
	toastTimeout = setTimeout(() => {
		showToast = false;
	}, 3000);
}

onMount(() => {
	// Initialize user pool for existing sessions on first mount
	if (existingSession?.id && !onlineUsers.length) {
		({ onlineUsers, offlineUsers } = initUserPool(existingSession.id));
	}
});

// Reactive: init user pool once sessionId becomes available for new sessions
$effect(() => {
	const sid = session.sessionId;
	if (sid && !onlineUsers.length) {
		({ onlineUsers, offlineUsers } = initUserPool(sid));
	}
});
</script>

<!--===================================================-->

<svelte:window onclick={handleWindowClick} />

{#if session.isEntering}
	<div class="fixed inset-0 z-[3000] flex flex-col items-center justify-center bg-[#313338]" out:fade={{ duration: 200 }}>
		<div class="flex items-center gap-2">
			<span class="h-3 w-3 animate-bounce rounded-full bg-[#5865F2]"></span>
			<span class="h-3 w-3 animate-bounce rounded-full bg-[#5865F2]" style="animation-delay: 0.2s"></span>
			<span class="h-3 w-3 animate-bounce rounded-full bg-[#5865F2]" style="animation-delay: 0.4s"></span>
		</div>
		<p class="mt-4 text-sm font-bold text-[#80848E] uppercase tracking-wider">Connecting...</p>
	</div>
{/if}

<div
	class="fixed inset-0 z-[999] flex h-[100dvh] w-full overflow-hidden bg-[#313338] text-gray-200 font-inter-stack selection:bg-[#5865F2] selection:text-white flex-col md:flex-row"
>
	<Overlays {contextMenu} {showToast} {t} onContextMenuMention={handleContextMenuMention} />

	<MobileTopBar {serverName} onToggleMenu={() => (showMobileMenu = !showMobileMenu)} />

	<Sidebar
		{serverName}
		{channelName}
		{serverAcronym}
		{userName}
		{avatarUrl}
		{taskId}
		{showMobileMenu}
		{t}
		onCloseMobileMenu={() => (showMobileMenu = false)}
		onMockAction={handleMockAction}
	/>

	<div class="flex flex-1 flex-col bg-[#313338] min-w-0 h-full relative">
		<ChatHeader
			{channelName}
			remainingTurns={session.remainingTurns}
			isCompleted={session.isCompleted}
			sessionId={session.sessionId}
			isCompleting={session.isCompleting}
			isSubmitting={session.isSubmitting}
			isInitializing={session.isInitializing}
			{showMembers}
			turnsLeftLabel={t.turnsLeft}
			evaluatingLabel={t.evaluating}
			finishTaskLabel={t.finishTask}
			onComplete={handleFinishClick}
			onToggleMembers={() => (showMembers = !showMembers)}
		/>

		<div class="flex flex-1 overflow-hidden relative">
			<div class="flex flex-1 flex-col min-w-0 relative">
				<MessageStream
					bind:chatContainer={session.chatContainer}
					messages={session.messages}
					isTyping={session.isTyping}
					isInitializing={session.isInitializing}
					agentUser={session.agentUser}
					limitReached={session.limitReached}
					{language}
					{emojiConv}
					retryLabel={t.retry}
					onRetry={session.handleRetry}
				/>

				<MessageInput
					bind:inputText={session.inputText}
					isSubmitting={session.isSubmitting}
					isCompleting={session.isCompleting}
					isCompleted={session.isCompleted}
					isInitializing={session.isInitializing}
					limitReached={session.limitReached}
					isWaitingRetry={session.isWaitingRetry}
					{messagePlaceholder}
					{language}
					sessionId={session.sessionId}
					{t}
					{allUsers}
					onSend={session.handleSend}
				/>
			</div>

			{#if showMembers}
				<MemberList
					{onlineUsers}
					{offlineUsers}
					agentUser={session.agentUser}
					{userName}
					{avatarUrl}
					onlineLabel={t.online}
					offlineLabel={t.offline}
					onCloseMembers={() => (showMembers = false)}
					onContextMenu={handleContextMenu}
				/>
			{/if}
		</div>
	</div>

	<BottomSheet
		show={showFinishConfirm}
		title="Finish Task"
		message="Are you ready to finish this task and see your feedback? You won't be able to send more messages after confirming."
		confirmLabel="Finish & Review"
		cancelLabel="Keep Practicing"
		onConfirm={handleFinishConfirm}
		onCancel={handleFinishCancel}
	/>
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
