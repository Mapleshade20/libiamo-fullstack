<script lang="ts">
import EmojiConvertor from "emoji-js";
import { onMount, tick } from "svelte";
import { fade } from "svelte/transition";
import { invalidateAll } from "$app/navigation";
import { prepareMarkdownText } from "../../utils/markdownUtils";
import { formatTime, normalizeText } from "../../utils/messageUtils";
import { calculateCurrentTurns, isTurnLimitReached } from "../../utils/sessionUtils";
import { postAction } from "../apiService";
import { buildChatMessages, type ChatMessage, updateMessageById } from "../chatMessages";
import type { TutorFeedback } from "../types";
import ChatHeader from "./ChatHeader.svelte";
import { runAgentReplyWorkflow } from "./chatFlowController";
import { i18n } from "./i18n";
import MemberList from "./MemberList.svelte";
import MessageInput from "./MessageInput.svelte";
import MessageStream from "./MessageStream.svelte";
import MobileTopBar from "./MobileTopBar.svelte";
import { getOpeningStateMessages } from "./messageTransformer";
import Overlays from "./Overlays.svelte";
import { retryManager } from "./retryManager";
import Sidebar from "./Sidebar.svelte";
import { type ChatOpeningState, type ChatUser } from "./types";
import { initUserPool } from "./userPool";

/*
 * ======================================================
 * Area 1: Props input & Derived state definitions
 * ======================================================
 */
interface Props {
	taskId?: string | number;
	userName?: string;
	avatarUrl?: string;
	language?: string;
	existingSession?: any;
	openingState?: unknown;
	maxTurns?: number;
	agentStartsFirst?: boolean;
}

let {
	taskId = "",
	userName = "Learner",
	avatarUrl = "",
	language = "en",
	existingSession = null,
	openingState = null,
	maxTurns = 0,
	agentStartsFirst = true,
}: Props = $props();

/*
 * ======================================================
 * Area 2: Core state variables
 * ======================================================
 */

const t = $derived(i18n[language as keyof typeof i18n] || i18n.en);
const openingStateData = $derived((openingState ?? {}) as ChatOpeningState);

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
type Message = ChatMessage;

let showMobileMenu = $state(false);
let sessionId = $state<number | null>(null);
let lastLoadedSessionId = $state<number | null>(null);
let lastServerMessageCount = $state<number>(0);
let isSubmitting = $state(false);
let isEntering = $state(true);
let hasAutoCompleted = $state(false);
let isCompleting = $state(false);
let isCompleted = $state(false);
let showEvaluationModal = $state(false);
let isInitializing = $state(false);
let feedback = $state<TutorFeedback | null>(null);
let messages = $state<ChatMessage[]>([]);
let hasAttemptedComplete = $state(false);
let agentUser = $state<ChatUser>({
	id: "agent",
	name: "Agent",
	status: "Online",
	color: "bg-[#5865F2]",
	isAgent: true,
});
let onlineUsers = $state<ChatUser[]>([]);
let offlineUsers = $state<ChatUser[]>([]);
let allUsers = $derived([agentUser, ...onlineUsers, ...offlineUsers]);

let inputText = $state("");
let chatContainer = $state<HTMLElement | null>(null);
let showToast = $state(false);
let toastTimeout: ReturnType<typeof setTimeout>;
let showMembers = $state(true);

let contextMenu = $state({
	show: false,
	x: 0,
	y: 0,
	targetUser: null as ChatUser | null,
});

const isWaitingRetry = $derived(messages.some((m) => m.deliveryState === "failed" && !m.isHidden));
const isAnyMessagePending = $derived(messages.some((m) => m.deliveryState === "pending" && !m.isHidden));
const isTyping = $derived((isInitializing || isSubmitting || isAnyMessagePending) && !isWaitingRetry);
const currentTurns = $derived(calculateCurrentTurns(messages, agentStartsFirst));
const limitReached = $derived(isTurnLimitReached(currentTurns, maxTurns ?? 0));
const remainingTurns = $derived(maxTurns > 0 ? Math.max(0, maxTurns - currentTurns) : null);

/*
 * ======================================================
 * Area 3: Handlers
 * ======================================================
 */

function handleRetry(messageId: string) {
	const resolved = retryManager.resolveRetry(messageId);

	if (!resolved) {
		void retryPersistedAgentReply(messageId);
		return;
	}

	messages = updateMessageById(messages, messageId, (message) => ({
		...message,
		isHidden: true,
	}));
}

const getWorkflowCallbacks = () => ({
	formatTime,
	labels: {
		stillProcessing: t.stillProcessingMessage,
		retryFailed: t.retryFailedMessage,
	},
	onScrollToBottom: scrollToBottom,
	onInvalidate: () => invalidateAll(),
	onComplete: handleComplete,
	onUpdateMessage: (id: string, updates: Partial<Message>) => {
		messages = updateMessageById(messages, id, (m) => ({
			...m,
			...updates,
		}));
	},
	onCreateAgentMessage: (params: { id: string; text: string; state: "pending" | "sent" | "failed"; timestamp: string; clientMessageId?: string }) => {
		const { id, text, state, timestamp, clientMessageId } = params;
		messages = [
			...messages,
			{
				id,
				role: "agent",
				text,
				timestamp,
				authorName: agentUser.name,
				avatarColor: agentUser.color,
				deliveryState: state,
				clientMessageId,
			},
		];
	},
});

async function retryPersistedAgentReply(messageId: string) {
	const failedMessage = messages.find((m) => m.id === messageId);
	if (!failedMessage?.clientMessageId || isSubmitting || isCompleted || isInitializing || !sessionId) return;

	isSubmitting = true;

	try {
		await runAgentReplyWorkflow(sessionId, failedMessage.clientMessageId, failedMessage.retryText || failedMessage.text, messageId, {
			...getWorkflowCallbacks(),
			onStart: () => {
				messages = updateMessageById(messages, messageId, (m) => ({ ...m, isHidden: true }));
			},
		});
	} finally {
		isSubmitting = false;
	}
}

async function scrollToBottom() {
	await tick();
	if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;
}

async function handleComplete() {
	if (!sessionId || isCompleting || isCompleted) return;
	isCompleting = true;
	hasAttemptedComplete = true;
	try {
		const result = await postAction("complete", sessionId);

		if (result.type === "success" && result.data) {
			isCompleted = true;
			feedback = result.data.feedback as TutorFeedback;
			showEvaluationModal = true;
			await scrollToBottom();
			await invalidateAll();
		} else {
			hasAttemptedComplete = false;
		}
	} catch (error) {
		console.error("Completion failed:", error);
		hasAttemptedComplete = false;
	} finally {
		isCompleting = false;
	}
}

async function handleSend(text: string) {
	if (!text.trim() || isSubmitting || isCompleted || isInitializing || !sessionId || limitReached) return;

	const currentText = prepareMarkdownText(text);
	const clientMessageId = crypto.randomUUID();

	isSubmitting = true;

	messages = [
		...messages,
		{
			id: crypto.randomUUID(),
			role: "user",
			text: currentText,
			timestamp: formatTime(new Date()),
			authorName: userName,
			avatar: avatarUrl,
			clientMessageId,
		},
	];
	await scrollToBottom();

	try {
		await runAgentReplyWorkflow(sessionId, clientMessageId, currentText, null, getWorkflowCallbacks());
	} finally {
		isSubmitting = false;
	}
}

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
		const space = inputText.endsWith(" ") || inputText === "" ? "" : " ";
		inputText += `${space}@${contextMenu.targetUser.name} `;
	}
	contextMenu.show = false;
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

/*
 * ======================================================
 * Area 4: Side effects
 * ======================================================
 */

$effect(() => {
	if (limitReached && !isCompleting && !isCompleted && sessionId && !hasAutoCompleted && !isSubmitting) {
		hasAutoCompleted = true;
		handleComplete();
	}
});

$effect(() => {
	if (existingSession) {
		const serverMsgCount = existingSession.messages?.length || 0;

		if (existingSession.id !== lastLoadedSessionId || serverMsgCount > lastServerMessageCount) {
			const currentId = existingSession.id;
			lastLoadedSessionId = currentId;
			lastServerMessageCount = serverMsgCount;
			sessionId = currentId;

			({ agentUser, onlineUsers, offlineUsers } = initUserPool(currentId));

			isCompleted = existingSession.status === "completed" || existingSession.status === "evaluated";
			feedback = existingSession.tutorFeedback || null;

			if (isCompleted && feedback) showEvaluationModal = true;

			const openingMessages = getOpeningStateMessages({
				openingStateData: existingSession.openingState ?? {},
				userName,
				agentUser,
				avatarUrl,
				labels: { earlier: t.earlier },
			});

			const sortedRawMessages = [...(existingSession.messages ?? [])].sort(
				(a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
			);

			const sessionMessages = buildChatMessages({
				rawMessages: sortedRawMessages,
				formatTimestamp: formatTime,
				userName,
				agentName: agentUser.name,
				avatarUrl,
				agentColor: agentUser.color,
				labels: t,
				isHidden: (m) => m.content === "*User joined the server*",
			});

			messages = [...openingMessages, ...sessionMessages];

			tick().then(() => {
				if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;
			});
		}
	}
});

$effect(() => {
	const needsPolling = messages.some((m) => m.deliveryState === "pending" && !m.isHidden);
	if (needsPolling && !isSubmitting && sessionId) {
		const interval = setInterval(() => {
			invalidateAll();
		}, 3000);
		return () => clearInterval(interval);
	}
});

/*
 * ======================================================
 * Area 5: Lifecycle
 * ======================================================
 */

onMount(async () => {
	setTimeout(() => {
		isEntering = false;
	}, 500);
	if (!existingSession) {
		isInitializing = true;
		try {
			const startResult = await postAction("start", null);

			if (startResult.type === "success" && startResult.data) {
				const currentId = startResult.data.sessionId as number;
				sessionId = currentId;
				lastLoadedSessionId = currentId;

				({ agentUser, onlineUsers, offlineUsers } = initUserPool(currentId));

				const openingMessages = getOpeningStateMessages({
					openingStateData: openingStateData,
					userName,
					agentUser,
					avatarUrl,
					labels: { earlier: t.earlier },
				});

				if (agentStartsFirst) {
					messages = [
						...openingMessages,
						{
							id: crypto.randomUUID(),
							role: "user",
							text: "*User joined the server*",
							timestamp: formatTime(new Date()),
							authorName: userName,
							avatar: avatarUrl,
							isHidden: true,
						},
					];

					await scrollToBottom();

					await runAgentReplyWorkflow(currentId, `join-${currentId}`, "*User joined the server*", null, getWorkflowCallbacks());
				} else {
					messages = [...openingMessages];
				}

				await scrollToBottom();
				await invalidateAll();
			}
		} catch (error) {
			console.error("Initialization failed:", error);
		} finally {
			isInitializing = false;
		}
	} else {
		if (!onlineUsers.length && existingSession.id) {
			({ agentUser, onlineUsers, offlineUsers } = initUserPool(existingSession.id));
		}
	}
});
</script>

<!--===================================================-->

<svelte:window onclick={handleWindowClick} />

{#if isEntering}
	<div class="fixed inset-0 z-[3000] flex flex-col items-center justify-center bg-[#313338]" out:fade={{ duration: 200 }}>
		<div class="flex items-center gap-2">
			<span class="h-3 w-3 animate-bounce rounded-full bg-[#5865F2]"></span>
			<span class="h-3 w-3 animate-bounce rounded-full bg-[#5865F2]" style="animation-delay: 0.2s"></span>
			<span class="h-3 w-3 animate-bounce rounded-full bg-[#5865F2]" style="animation-delay: 0.4s"></span>
		</div>
		<p class="mt-4 text-sm font-bold text-[#80848E] uppercase tracking-wider">Connecting...</p>
	</div>
{/if}

<!-- =============== MAIN CONTAINER =============== -->

<div
	class="fixed inset-0 z-[999] flex h-[100dvh] w-full overflow-hidden bg-[#313338] text-gray-200 font-sans selection:bg-[#5865F2] selection:text-white flex-col md:flex-row"
>
	<!-- 1. MODALS & OVERLAYS -->
	<Overlays
		{showEvaluationModal}
		{feedback}
		{contextMenu}
		{showToast}
		{taskId}
		{t}
		onCloseEvaluation={() => (showEvaluationModal = false)}
		onContextMenuMention={handleContextMenuMention}
	/>

	<!-- 2. MOBILE TOP BAR -->
	<MobileTopBar {serverName} onToggleMenu={() => (showMobileMenu = !showMobileMenu)} />

	<!-- 3. SIDEBAR SECTION -->
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

	<!-- 4. MAIN CONTENT AREA -->
	<div class="flex flex-1 flex-col bg-[#313338] min-w-0 h-full relative">
		<!-- Channel Header -->
		<ChatHeader
			{channelName}
			{remainingTurns}
			{isCompleted}
			{sessionId}
			{isCompleting}
			{isSubmitting}
			{isInitializing}
			{showMembers}
			turnsLeftLabel={t.turnsLeft}
			evaluatingLabel={t.evaluating}
			finishTaskLabel={t.finishTask}
			onComplete={handleComplete}
			onToggleMembers={() => (showMembers = !showMembers)}
		/>

		<!-- Chat & Member List Container -->
		<div class="flex flex-1 overflow-hidden relative">
			<!-- Message & Input Column -->
			<div class="flex flex-1 flex-col min-w-0 relative">
				<MessageStream
					bind:chatContainer
					{messages}
					{isTyping}
					{isInitializing}
					{agentUser}
					{limitReached}
					{language}
					{emojiConv}
					retryLabel={t.retry}
					onRetry={handleRetry}
				/>

				<MessageInput
					bind:inputText
					{isSubmitting}
					{isCompleting}
					{isCompleted}
					{isInitializing}
					{limitReached}
					{isWaitingRetry}
					{messagePlaceholder}
					{sessionId}
					{t}
					{allUsers}
					onSend={handleSend}
				/>
			</div>

			<!-- Member List -->
			{#if showMembers}
				<MemberList
					{onlineUsers}
					{offlineUsers}
					{agentUser}
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
