<script lang="ts">
import CheckCircle from "@lucide/svelte/icons/check-circle";
import ChevronDown from "@lucide/svelte/icons/chevron-down";
import Hash from "@lucide/svelte/icons/hash";
import Info from "@lucide/svelte/icons/info";
import Lightbulb from "@lucide/svelte/icons/lightbulb";
import LogOut from "@lucide/svelte/icons/log-out";
import Menu from "@lucide/svelte/icons/menu";
import Mic from "@lucide/svelte/icons/mic";
import Plus from "@lucide/svelte/icons/plus";
import Settings from "@lucide/svelte/icons/settings";
import Smile from "@lucide/svelte/icons/smile";
import Users from "@lucide/svelte/icons/users";
import EmojiConvertor from "emoji-js";
import { onMount, tick } from "svelte";
import { fade, fly, slide } from "svelte/transition";
import { deserialize } from "$app/forms";
import { invalidateAll } from "$app/navigation";
import EmojiPicker from "../EmojiPicker.svelte";
import MarkdownRenderer from "../MarkdownRenderer.svelte";
import ResizeableTextarea from "../ResizeableTextarea.svelte";
import { extractEmojiFromPickerEvent, normalizeEmojiTextForDisplay } from "../utils/emojiUtils";
import { prepareMarkdownText } from "../utils/markdownUtils";
import { formatTime, getTodayDateString, normalizeText } from "../utils/messageUtils";
import { calculateCurrentTurns, getTurnLimitMessage, isTurnLimitReached } from "../utils/sessionUtils";
import { postAction, submitAgentReply } from "./apiService";
import { runAgentReplyWorkflow } from "./chatFlowController";
import { buildChatMessages, type ChatMessage } from "./chatMessages";
import { i18n } from "./i18n";
import { retryManager, updateMessageById } from "./messageManager";
import { getOpeningStateMessages } from "./messageTransformer";
import { initUserPool } from "./mockUser";
import { type ChatOpeningState, type ChatUser, type ObjectiveResult, type TutorFeedback } from "./types";

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

let showMobileMenu = $state(false); // for mobile responsiveness
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

let inputRef = $state<HTMLInputElement | null>(null);
let inputText = $state("");
let chatContainer: HTMLElement;
let showToast = $state(false);
let toastTimeout: ReturnType<typeof setTimeout>;
let showMembers = $state(true);

let showMentionMenu = $state(false);
let mentionQuery = $state("");
let mentionIndex = $state(0);
let filteredMentionUsers = $derived(allUsers.filter((u) => u.name.toLowerCase().includes(mentionQuery.toLowerCase())));
let hints = $state<Array<{ text: string; translation: string }>>([]);
let isGettingHint = $state(false);
let showHintMenu = $state(false);
let contextMenu = $state({
	show: false,
	x: 0,
	y: 0,
	targetUser: null as ChatUser | null,
});
let showEmojiPicker = $state(false);
const isWaitingRetry = $derived(messages.some((m) => m.deliveryState === "failed" && !m.isHidden));
const isAnyMessagePending = $derived(messages.some((m) => m.deliveryState === "pending" && !m.isHidden));
const isTyping = $derived((isInitializing || isSubmitting || isAnyMessagePending) && !isWaitingRetry);
const currentTurns = $derived(calculateCurrentTurns(messages, agentStartsFirst));
const limitReached = $derived(isTurnLimitReached(currentTurns, maxTurns ?? 0));
const remainingTurns = $derived(maxTurns > 0 ? Math.max(0, maxTurns - currentTurns) : null);

function handleEmojiSelected(event: CustomEvent | Event) {
	const emoji = extractEmojiFromPickerEvent(event);
	if (emoji) {
		inputText += emoji;
	}
	showEmojiPicker = false;
}

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

let hintAbortController: AbortController | null = null;

async function handleGetHint() {
	if (isGettingHint) {
		showHintMenu = true;
		return;
	}
	if (!sessionId || isCompleted) return;

	isGettingHint = true;
	showHintMenu = true;
	hints = [];
	hintAbortController = new AbortController();

	try {
		const formData = new FormData();
		formData.append("sessionId", String(sessionId));
		const res = await fetch(`?/hint`, {
			method: "POST",
			body: formData,
			signal: hintAbortController.signal,
		});
		const result = deserialize(await res.text());

		if (result.type === "success" && result.data) {
			hints = (result.data as any).hints;
		}
	} catch (error) {
		if (error instanceof DOMException && error.name === "AbortError") {
			console.log("Hint request was aborted by user.");
		} else {
			console.error("Failed to get hints:", error);
		}
	} finally {
		isGettingHint = false;
		hintAbortController = null;
	}
}

function closeHintMenu() {
	showHintMenu = false;
	if (isGettingHint && hintAbortController) {
		hintAbortController.abort();
		isGettingHint = false;
		hintAbortController = null;
	}
}

function selectHint(text: string) {
	inputText = text;
	showHintMenu = false;
	inputRef?.focus();
}

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

$effect(() => {
	const text = inputText;
	const match = text.match(/@([a-zA-Z0-9_]*)$/);
	if (match) {
		mentionQuery = match[1];
		showMentionMenu = true;
	} else {
		showMentionMenu = false;
	}
});

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

async function handleSend() {
	if (!inputText.trim() || isSubmitting || isCompleted || isInitializing || !sessionId || limitReached) return;

	const currentText = prepareMarkdownText(inputText);
	const clientMessageId = crypto.randomUUID();

	inputText = "";
	showMentionMenu = false;
	showEmojiPicker = false;
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

function insertMention(user: ChatUser) {
	const lastAtIndex = inputText.lastIndexOf("@");

	if (lastAtIndex !== -1) {
		const beforeMention = inputText.slice(0, lastAtIndex);
		inputText = `${beforeMention}@${user.name}`;
	} else {
		const space = inputText.endsWith(" ") || inputText === "" ? "" : " ";
		inputText += `${space}@${user.name} `;
	}

	showMentionMenu = false;
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
		inputRef?.focus();
	}
	contextMenu.show = false;
}

function handleWindowClick(e: MouseEvent) {
	if (contextMenu.show) contextMenu.show = false;

	const target = e.target as HTMLElement;
	if (!target.closest(".emoji-container-wrapper")) {
		showEmojiPicker = false;
	}
	if (!target.closest(".hint-container-wrapper")) {
		if (showHintMenu) {
			closeHintMenu();
		}
	}
}

function handleMockAction() {
	showToast = true;
	if (toastTimeout) clearTimeout(toastTimeout);
	toastTimeout = setTimeout(() => {
		showToast = false;
	}, 3000);
}
</script>

<!-- Global click handler for closing menus/pickers -->
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

<div
	class="fixed inset-0 z-[999] flex h-[100dvh] w-full overflow-hidden bg-[#313338] text-gray-200 font-sans selection:bg-[#5865F2] selection:text-white flex-col md:flex-row"
>
	<!-- 1. MODALS & OVERLAYS -->
	<!-- Evaluation/Feedback Modal -->
	{#if showEvaluationModal && feedback}
		<div transition:fade={{ duration: 200 }} class="absolute inset-0 z-[2000] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
			<div class="bg-[#2B2D31] border border-[#1E1F22] rounded-xl shadow-2xl w-full max-w-xl overflow-hidden flex flex-col transform transition-all">
				<div class="bg-[#23A559] p-6 text-center relative">
					<CheckCircle class="mx-auto text-white mb-2 drop-shadow-md" size={56} />
					<h2 class="text-2xl font-black text-white uppercase tracking-wide drop-shadow-md">{t.questCompleted}</h2>
					<p class="text-green-100 mt-1 font-medium text-sm">{t.tutorReport}</p>
				</div>
				<div class="p-6 overflow-y-auto max-h-[50vh] hide-scrollbar bg-[#313338]">
					<h3 class="text-xs font-black text-[#949BA4] uppercase mb-2 tracking-wider">{t.overallFeedback}</h3>
					<p class="text-[#DBDEE1] text-[15px] leading-relaxed whitespace-pre-wrap mb-8 bg-[#2B2D31] p-4 rounded-lg border border-[#1E1F22]">
						{feedback.content}
					</p>
					{#if feedback.objectiveResults && feedback.objectiveResults.length > 0}
						<h3 class="text-xs font-black text-[#949BA4] uppercase mb-3 tracking-wider">{t.objectiveAssessment}</h3>
						<div class="space-y-2">
							{#each feedback.objectiveResults as obj}
								<div class="flex items-center justify-between bg-[#2B2D31] p-3 rounded-lg border border-[#1E1F22] shadow-sm">
									<span class="text-[14px] text-[#DBDEE1] font-medium pr-4 leading-snug">{obj.text}</span>
									<span
										class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-base font-black shadow-inner {obj.grade ===
										'A'
											? 'bg-[#23A559] text-white'
											: obj.grade === 'B'
												? 'bg-[#FEE75C] text-black'
												: 'bg-[#DA373C] text-white'}"
										>{obj.grade}</span
									>
								</div>
							{/each}
						</div>
					{/if}
				</div>
				<div class="p-5 bg-[#2B2D31] border-t border-[#1E1F22] flex justify-end gap-3">
					<button
						type="button"
						class="px-5 py-2 rounded-md font-bold text-sm text-white bg-[#4E5058] hover:bg-[#6D6F78] transition-colors"
						onclick={() => (showEvaluationModal = false)}
					>
						{t.closeReview}
					</button>
					<a
						href="/"
						class="px-6 py-2 rounded-md font-bold text-sm text-white bg-[#5865F2] hover:bg-[#4752C4] shadow-md transition-colors flex items-center gap-2"
						>{t.returnHall}</a
					>
				</div>
			</div>
		</div>
	{/if}

	<!-- Context Menu for @mentions -->
	{#if contextMenu.show && contextMenu.targetUser}
		<div
			class="fixed z-[1000] bg-[#111214] border border-[#1E1F22] rounded shadow-lg py-1 w-48 text-sm text-[#DBDEE1]"
			style="top: {contextMenu.y}px; left: {contextMenu.x}px;"
		>
			<button
				type="button"
				class="w-full text-left px-3 py-1.5 hover:bg-[#5865F2] hover:text-white transition-colors"
				onclick={handleContextMenuMention}
			>
				Mention @{contextMenu.targetUser.name}
			</button>
		</div>
	{/if}

	<!-- Toast Notifications -->
	{#if showToast}
		<div
			transition:fade={{ duration: 150 }}
			class="absolute top-8 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-md bg-[#111214] px-4 py-3 text-sm font-medium text-white shadow-xl border border-[#1E1F22] z-[1000]"
		>
			<Info size={18} class="text-[#5865F2]" />
			{t.unavailableFeature}
		</div>
	{/if}

	<!-- 2. MOBILE TOP BAR -->
	<div class="flex h-12 w-full shrink-0 items-center justify-between border-b border-[#1F2023] bg-[#2B2D31] px-4 md:hidden">
		<button type="button" onclick={() => (showMobileMenu = !showMobileMenu)} class="text-[#B5BAC1] hover:text-white">
			<Menu size={24} />
		</button>
		<span class="font-bold text-white truncate px-4">{serverName}</span>
		<div class="w-6"></div>
	</div>

	<!-- 3. SIDEBAR SECTION (Responsive) -->
	<div
		class="fixed inset-0 z-[1001] flex md:relative md:flex h-full transition-transform duration-300 md:translate-x-0 {showMobileMenu
			? 'translate-x-0'
			: '-translate-x-full md:translate-x-0'}"
	>
		{#if showMobileMenu}
			<div
				role="button"
				tabindex="-1"
				class="fixed inset-0 bg-black/60 md:hidden -z-10"
				style="width: 100vw; height: 100vh;"
				onclick={() => (showMobileMenu = false)}
				onkeydown={(e) =>
					e.key === "Escape" && (showMobileMenu = false)}
				transition:fade={{ duration: 200 }}
			></div>
		{/if}

		<!-- Server Rail Actions -->
		<div class="z-10 flex w-[72px] shrink-0 flex-col items-center gap-2 overflow-y-auto bg-[#1E1F22] py-3 hide-scrollbar">
			<a
				href={`/task/${taskId}`}
				class="group relative flex h-12 w-12 items-center justify-center rounded-[24px] bg-[#313338] transition-all hover:rounded-[16px] overflow-hidden shadow-sm text-[#DBDEE1] hover:text-white hover:bg-[#DA373C]"
				title={t.returnTask}
			>
				<LogOut size={22} class="mr-0.5" />
			</a>
			<div class="h-[2px] w-8 rounded-full bg-[#35363C]"></div>
			<button type="button" class="relative flex h-12 w-12 items-center justify-center rounded-[16px] bg-[#5865F2] text-white transition-all">
				<div class="absolute -left-3 top-2 h-8 w-1 rounded-r-full bg-white"></div>
				<span class="text-sm font-medium">{serverAcronym}</span>
			</button>
			<button
				type="button"
				class="flex h-12 w-12 items-center justify-center rounded-[24px] bg-[#313338] text-[#23A559] transition-all hover:rounded-[16px] hover:bg-[#23A559] hover:text-white"
				onclick={handleMockAction}
			>
				<Plus size={24} />
			</button>
		</div>

		<!-- Channel List Navigation -->
		<div class="z-10 flex w-60 shrink-0 flex-col bg-[#2B2D31]">
			<button
				type="button"
				class="flex h-12 items-center justify-between border-b border-[#1F2023] px-4 font-semibold shadow-sm transition-colors hover:bg-[#35373C]"
				onclick={handleMockAction}
			>
				<span class="truncate">{serverName}</span>
				<ChevronDown size={18} />
			</button>
			<div class="flex-1 overflow-y-auto p-2 hide-scrollbar">
				<button
					type="button"
					class="w-full mb-1 mt-4 px-2 text-xs font-semibold text-[#949BA4] hover:text-gray-300 cursor-pointer flex justify-between items-center"
				>
					<span>{t.textChannels}</span>
					<Plus size={14} />
				</button>
				<button type="button" class="flex w-full items-center gap-1.5 rounded bg-[#404249] px-2 py-1.5 text-[#DBDEE1]">
					<Hash size={18} class="text-[#80848E]" />
					<span class="text-sm">{channelName}</span>
				</button>
			</div>
			<!-- User Profile Footer -->
			<div class="flex h-[52px] items-center justify-between bg-[#232428] px-2">
				<button
					type="button"
					class="flex items-center gap-2 rounded px-2 py-1 hover:bg-[#35373C] w-full max-w-[140px] truncate"
					onclick={handleMockAction}
				>
					<div class="relative h-8 w-8 shrink-0">
						<div class="h-full w-full rounded-full bg-[#5865F2] overflow-hidden flex items-center justify-center font-bold text-white">
							{#if avatarUrl}
								<img src={avatarUrl} alt="User" class="h-full w-full object-cover">
							{/if}
							{#if !avatarUrl}
								{userName.charAt(0).toUpperCase()}
							{/if}
						</div>
						<div class="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-[2.5px] border-[#232428] bg-[#23A559]"></div>
					</div>
					<div class="flex flex-col items-start text-sm truncate">
						<span class="font-semibold leading-tight text-white truncate w-full text-left">{userName}</span>
						<span class="text-xs text-[#949BA4]">{t.online}</span>
					</div>
				</button>
				<div class="flex gap-1 text-[#B5BAC1]">
					<button type="button" class="rounded p-1.5 hover:bg-[#35373C] hover:text-[#DBDEE1]" onclick={handleMockAction}><Mic size={18} /></button>
					<button type="button" class="rounded p-1.5 hover:bg-[#35373C] hover:text-[#DBDEE1]" onclick={handleMockAction}>
						<Settings size={18} />
					</button>
				</div>
			</div>
		</div>
	</div>

	<!-- 4. MAIN CONTENT AREA -->
	<div class="flex flex-1 flex-col bg-[#313338] min-w-0 h-full relative">
		<!-- Channel Header -->
		<div class="flex h-12 shrink-0 items-center justify-between border-b border-[#1F2023] px-4 shadow-sm z-10">
			<div class="flex items-center gap-2 overflow-hidden px-1">
				<Hash size={24} class="text-[#80848E] shrink-0" />
				<span class="font-semibold text-white truncate">{channelName}</span>
			</div>
			<div class="flex items-center gap-4 text-[#B5BAC1]">
				{#if remainingTurns !== null && !isCompleted}
					<div class="flex items-center gap-2 px-3 py-1 rounded bg-[#232428] shadow-inner border border-[#1E1F22]">
						<span class="text-xs font-bold text-[#949BA4] uppercase tracking-wider">{t.turnsLeft}</span>
						<span
							class="text-sm font-black {remainingTurns <= 2
								? 'text-[#DA373C]'
								: 'text-[#23A559]'}"
						>
							{remainingTurns}
						</span>
					</div>
				{/if}
				{#if !isCompleted && sessionId}
					<button
						type="button"
						class="flex items-center gap-2 rounded bg-[#23A559] px-3 py-1 text-sm font-medium text-white transition-colors hover:bg-[#1D8749] disabled:opacity-50"
						onclick={handleComplete}
						disabled={isCompleting ||
							isSubmitting ||
							isInitializing}
					>
						<CheckCircle size={16} />
						<span class="hidden sm:inline">{isCompleting ? t.evaluating : t.finishTask}</span>
					</button>
				{/if}
				<button
					type="button"
					class="transition-colors {showMembers
						? 'text-white'
						: 'hover:text-[#DBDEE1]'}"
					onclick={() => (showMembers = !showMembers)}
				>
					<Users size={20} />
				</button>
			</div>
		</div>

		<!-- Chat & Member List Container (Combined) -->
		<div class="flex flex-1 overflow-hidden relative">
			<!-- Message & Input Column -->
			<div class="flex flex-1 flex-col min-w-0 relative">
				<!-- Message Stream Display -->
				<div bind:this={chatContainer} class="flex-1 overflow-y-auto px-4 py-6 scroll-smooth">
					<div class="my-4 mt-auto flex items-center justify-center">
						<div class="h-px flex-1 bg-[#404249]"></div>
						<span class="px-2 text-xs font-semibold text-[#949BA4]">{getTodayDateString(language)}</span>
						<div class="h-px flex-1 bg-[#404249]"></div>
					</div>

					{#each messages.filter((m) => !m.isHidden && m.deliveryState !== "pending") as msg (msg.id)}
						<div class="mt-4 flex hover:bg-[#2E3035] p-1 -mx-4 px-4 rounded group">
							<div
								class="mr-4 mt-0.5 h-10 w-10 shrink-0 rounded-full {msg.role ===
								'agent'
									? msg.avatarColor
									: 'bg-[#5865F2]'} flex items-center justify-center text-white font-bold overflow-hidden shadow-inner"
							>
								{#if msg.role === "user" && msg.avatar}
									<img src={msg.avatar} alt="User Avatar" class="h-full w-full object-cover">
								{:else}
									{msg.authorName.charAt(0).toUpperCase()}
								{/if}
							</div>
							<div class="flex-1 overflow-hidden">
								<div class="flex items-baseline gap-2">
									<span class="font-medium text-white hover:underline cursor-pointer">{msg.authorName}</span>
									<span class="text-xs text-[#949BA4]">{msg.timestamp}</span>
								</div>
								<div class="mt-0.5 text-[#DBDEE1] break-words leading-normal">
									{#if msg.role === "agent" && msg.deliveryState === "failed"}
										<div class="mt-1 flex flex-wrap items-center gap-2">
											<span class="text-[#F28B82] whitespace-pre-wrap"
												>{emojiConv.replace_colons(
													msg.text,
												)}</span
											>
											{#if !limitReached}
												<button
													type="button"
													class="flex items-center gap-2 rounded bg-[#DA373C] px-3 py-1 text-sm font-medium text-white transition-colors hover:bg-[#B52D31]"
													onclick={() =>
														handleRetry(msg.id)}
												>
													<CheckCircle size={16} />{t.retry}
												</button>
											{/if}
										</div>
									{:else if msg.role === "agent" && msg.deliveryState === "pending"}
										<div class="mt-1 flex flex-wrap items-center gap-2">
											<span class="text-[#F0B232] whitespace-pre-wrap"
												>{emojiConv.replace_colons(
													msg.text,
												)}</span
											>
											<button
												type="button"
												class="flex items-center gap-2 rounded bg-[#5865F2] px-3 py-1 text-sm font-medium text-white hover:bg-[#4752C4]"
												onclick={() =>
													handleRetry(msg.id)}
											>
												{t.retry}
											</button>
										</div>
									{:else}
										<div class="markdown-wrapper">
											<MarkdownRenderer
												content={normalizeEmojiTextForDisplay(
													emojiConv.replace_colons(
														msg.text,
													),
												)}
											/>
										</div>
									{/if}
								</div>
							</div>
						</div>
					{/each}

					{#if isTyping}
						<div class="mt-4 flex hover:bg-[#2E3035] p-1 -mx-4 px-4 rounded group items-center gap-3">
							<div
								class="mr-1 h-10 w-10 shrink-0 rounded-full {agentUser.color} flex items-center justify-center text-white font-bold overflow-hidden"
							>
								{agentUser.name.charAt(0).toUpperCase()}
							</div>

							<div class="flex-1 flex items-center gap-3">
								<div class="flex gap-1">
									<span class="w-2 h-2 rounded-full bg-[#80848E] animate-bounce"></span>
									<span class="w-2 h-2 rounded-full bg-[#80848E] animate-bounce" style="animation-delay: 0.2s"></span>
									<span class="w-2 h-2 rounded-full bg-[#80848E] animate-bounce" style="animation-delay: 0.4s"></span>
								</div>
								<span class="text-xs font-semibold text-[#80848E]">
									{isInitializing
										? "Agent is joining..."
										: `${agentUser.name} is typing...`}
								</span>
							</div>
						</div>
					{/if}
				</div>

				<!-- Message Input Section -->
				<div class="px-4 pb-6 pt-1 shrink-0 relative">
					{#if showMentionMenu && filteredMentionUsers.length > 0}
						<div class="absolute bottom-[100%] left-4 mb-2 w-72 bg-[#2B2D31] border border-[#1E1F22] rounded shadow-xl overflow-hidden z-50">
							<div class="px-3 py-2 text-xs font-bold text-[#949BA4] uppercase bg-[#232428]">Members</div>
							<ul class="max-h-60 overflow-y-auto hide-scrollbar py-1">
								{#each filteredMentionUsers as user, i}
									<li class="mx-1">
										<button
											type="button"
											class="w-full text-left px-3 py-2 rounded hover:bg-[#35373C] cursor-pointer flex items-center gap-2 {mentionIndex ===
											i
												? 'bg-[#35373C]'
												: ''}"
											onmouseenter={() =>
												(mentionIndex = i)}
											onmousedown={(e) => {
												e.preventDefault();
												insertMention(user);
											}}
										>
											<div
												class="w-6 h-6 shrink-0 rounded-full {user.color} flex items-center justify-center text-xs font-bold text-white overflow-hidden"
											>
												{user.name.charAt(0)}
											</div>
											<span class="text-[#DBDEE1] text-sm font-medium">{user.name}</span>
											{#if user.isAgent}
												<span class="ml-auto text-[10px] bg-[#5865F2] text-white px-1.5 rounded font-bold uppercase tracking-wide">Bot</span>
											{/if}
										</button>
									</li>
								{/each}
							</ul>
						</div>
					{/if}

					<div class="flex flex-col relative rounded-lg bg-[#383A40]">
						<div
							class="flex items-start px-4 {isCompleted ||
							limitReached
								? 'opacity-50'
								: ''}"
						>
							<div class="flex h-[44px] shrink-0 items-center justify-center mr-4">
								<button
									type="button"
									class="rounded-full bg-[#B5BAC1] p-1 text-[#383A40] transition-colors hover:bg-[#DBDEE1]"
									onclick={handleMockAction}
								>
									<Plus size={16} strokeWidth={3} />
								</button>
							</div>

							<div class="flex-1 min-w-0">
								<ResizeableTextarea
									bind:value={inputText}
									maxRows={10}
									disabled={isSubmitting ||
										isCompleting ||
										isCompleted ||
										isInitializing ||
										limitReached}
									placeholder={isCompleted
										? "Session ended"
										: limitReached
											? "Turn limit reached"
											: isWaitingRetry
												? t.retryInputPlaceholder
												: messagePlaceholder}
									onKeyDown={(e: KeyboardEvent) => {
										if (
											showMentionMenu &&
											filteredMentionUsers.length > 0
										) {
											if (e.key === "ArrowDown") {
												e.preventDefault();
												mentionIndex =
													(mentionIndex + 1) %
													filteredMentionUsers.length;
												return;
											}
											if (e.key === "ArrowUp") {
												e.preventDefault();
												mentionIndex =
													(mentionIndex -
														1 +
														filteredMentionUsers.length) %
													filteredMentionUsers.length;
												return;
											}
											if (
												e.key === "Enter" ||
												e.key === "Tab"
											) {
												e.preventDefault();
												insertMention(
													filteredMentionUsers[
														mentionIndex
													],
												);
												return;
											}
											if (e.key === "Escape") {
												showMentionMenu = false;
												return;
											}
										}

										if (e.key === "Enter" && !e.shiftKey) {
											const isMobile =
												window.matchMedia(
													"(max-width: 768px)",
												).matches;
											if (!isMobile) {
												e.preventDefault();
												handleSend();
											}
										}
									}}
								/>
							</div>

							<div class="flex h-[44px] shrink-0 items-center justify-center gap-3 ml-3 text-[#B5BAC1] relative">
								<div class="relative flex h-full items-center">
									<button
										type="button"
										class="transition-colors {isGettingHint
											? 'text-yellow-400'
											: 'hover:text-[#DBDEE1]'}"
										onclick={(e) => {
											e.stopPropagation();
											handleGetHint();
										}}
										title={t.getHint}
									>
										<Lightbulb
											size={22}
											class={isGettingHint
												? "animate-pulse"
												: ""}
										/>
									</button>
									{#if showHintMenu}
										<div
											class="absolute bottom-[100%] right-0 mb-4 w-72 bg-[#2B2D31] border border-[#1E1F22] rounded-lg shadow-xl overflow-hidden z-50 flex flex-col"
										>
											<div
												class="px-3 py-2 text-xs font-bold text-[#949BA4] uppercase bg-[#232428] border-b border-[#1E1F22] flex justify-between items-center"
											>
												<span>{t.hintTitle}</span>
												<button
													type="button"
													onclick={(e) => {
														e.stopPropagation();
														closeHintMenu();
													}}
													class="hover:text-white text-lg"
												>
													&times;
												</button>
											</div>
											<div class="p-2 flex flex-col gap-1 max-h-60 overflow-y-auto hide-scrollbar">
												{#if isGettingHint}
													<div class="py-6 text-center text-sm text-[#80848E] italic animate-pulse">{t.thinking}</div>
												{:else}
													{#each hints as hint}
														<button
															type="button"
															class="w-full text-left p-2.5 rounded hover:bg-[#35373C] transition-colors border border-transparent hover:border-[#404249]"
															onclick={() =>
																selectHint(
																	hint.text,
																)}
														>
															<div class="text-[13px] text-[#DBDEE1] font-medium leading-snug">{hint.text}</div>
														</button>
													{/each}
												{/if}
											</div>
										</div>
									{/if}
								</div>

								<div class="relative flex h-full items-center">
									<button
										type="button"
										class="transition-colors {showEmojiPicker
											? 'text-white'
											: 'hover:text-[#DBDEE1]'}"
										onclick={(e) => {
											e.stopPropagation();
											showEmojiPicker = !showEmojiPicker;
										}}
									>
										<Smile size={22} />
									</button>
									{#if showEmojiPicker}
										<div
											class="absolute bottom-[100%] right-0 mb-4 z-[1002] bg-[#232428] border border-[#1E1F22] rounded-lg shadow-xl overflow-hidden"
											transition:fade={{ duration: 100 }}
										>
											<div class="max-h-[300px] overflow-y-auto custom-scrollbar"><EmojiPicker onEmojiSelected={handleEmojiSelected} /></div>
										</div>
									{/if}
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>

			<!-- Member List (Sidebar) - REPOSITIONED INSIDE CHAT FLEX CONTAINER -->
			{#if showMembers}
				<!-- Overlay for mobile view -->
				<div
					role="none"
					class="fixed inset-0 z-[1001] bg-black/40 xl:hidden"
					onclick={() => (showMembers = false)}
					transition:fade={{ duration: 150 }}
				></div>

				<!-- Sidebar container -->
				<div
					class="fixed inset-y-0 right-0 z-[1002] flex w-60 flex-col bg-[#2B2D31] border-l border-[#26272B] shadow-2xl xl:shadow-none xl:static xl:z-0 xl:translate-x-0"
					transition:fly={{ x: 240, duration: 250 }}
				>
					<div class="flex-1 overflow-y-auto px-2 py-4 hide-scrollbar">
						<!-- Online Header -->
						<h3 class="px-2 pt-2 pb-1 text-[12px] font-semibold text-[#949BA4] uppercase">{t.online} — {onlineUsers.length + 2}</h3>

						<!-- Current User Item -->
						<div class="flex items-center gap-3 px-2 py-1.5 hover:bg-[#35373C] rounded mt-0.5 opacity-100 transition-colors cursor-default">
							<div class="relative h-8 w-8 shrink-0">
								<div
									class="h-full w-full rounded-full bg-[#5865F2] overflow-hidden flex items-center justify-center font-bold text-white shadow-inner text-sm"
								>
									{#if avatarUrl}
										<img src={avatarUrl} alt="User" class="h-full w-full object-cover">
									{:else}
										{userName.charAt(0).toUpperCase()}
									{/if}
								</div>
								<div class="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-[2.5px] border-[#2B2D31] bg-[#23A559]"></div>
							</div>
							<span class="text-[#DBDEE1] font-medium text-sm truncate">{userName} (You)</span>
						</div>

						<!-- Bot / Agent Item -->
						<button
							type="button"
							class="flex w-full items-center text-left gap-3 px-2 py-1.5 hover:bg-[#35373C] rounded cursor-pointer mt-0.5 transition-colors"
							oncontextmenu={(e) =>
								handleContextMenu(e, agentUser)}
						>
							<div class="relative h-8 w-8 shrink-0">
								<div class="h-full w-full rounded-full {agentUser.color} flex items-center justify-center font-bold text-white uppercase text-sm">
									{agentUser.name.charAt(0)}
								</div>
								<div class="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-[2.5px] border-[#2B2D31] bg-[#23A559]"></div>
							</div>
							<div class="flex flex-col justify-center min-w-0">
								<div class="flex items-center gap-1">
									<span class="text-[#DBDEE1] font-medium text-sm truncate">{agentUser.name}</span>
									<span class="text-[9px] bg-[#5865F2] text-white px-1 rounded font-bold uppercase tracking-wide leading-tight">Bot</span>
								</div>
								<span class="text-xs text-[#B5BAC1] truncate">{agentUser.status}</span>
							</div>
						</button>

						<!-- Online Others -->
						{#each onlineUsers as user (user.name)}
							<button
								type="button"
								class="flex w-full items-center text-left gap-3 px-2 py-1.5 hover:bg-[#35373C] rounded cursor-pointer mt-0.5 transition-colors"
								oncontextmenu={(e) =>
									handleContextMenu(e, user)}
							>
								<div class="relative h-8 w-8 shrink-0">
									<div class="h-full w-full rounded-full {user.color} flex items-center justify-center font-bold text-white uppercase text-sm">
										{user.name.charAt(0)}
									</div>
									<div class="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-[2.5px] border-[#2B2D31] bg-[#23A559]"></div>
								</div>
								<div class="flex flex-col justify-center min-w-0">
									<span class="text-[#DBDEE1] font-medium text-sm truncate">{user.name}</span>
									<span class="text-xs text-[#B5BAC1] truncate">{user.status}</span>
								</div>
							</button>
						{/each}

						<!-- Offline Header -->
						<h3 class="px-2 pt-6 pb-1 text-[12px] font-semibold text-[#949BA4] uppercase">{t.offline} — {offlineUsers.length}</h3>
						{#each offlineUsers as user (user.name)}
							<button
								type="button"
								class="flex w-full items-center text-left gap-3 px-2 py-1.5 hover:bg-[#35373C] rounded cursor-pointer mt-0.5 opacity-50 hover:opacity-100 transition-all font-medium"
								oncontextmenu={(e) =>
									handleContextMenu(e, user)}
							>
								<div class="relative h-8 w-8 shrink-0">
									<div class="h-full w-full rounded-full {user.color} flex items-center justify-center font-bold text-white uppercase text-sm">
										{user.name.charAt(0)}
									</div>
								</div>
								<span class="text-[#80848E] text-sm truncate ml-3">{user.name}</span>
							</button>
						{/each}
					</div>
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
.hide-scrollbar {
	-ms-overflow-style: none;
	scrollbar-width: none;
}
.hide-scrollbar::-webkit-scrollbar {
	display: none;
}
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
