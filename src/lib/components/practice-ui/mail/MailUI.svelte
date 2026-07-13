<script lang="ts">
import Mail from "@lucide/svelte/icons/mail";
import { onMount, tick } from "svelte";
import { fade } from "svelte/transition";
import { invalidate } from "$app/navigation";
import { BottomSheet } from "$lib/components/ui/bottom-sheet";
import { MAIL_TEXT_MAX_LENGTH } from "$lib/constants";
import { PRACTICE_SESSION_DEPENDENCY, TRIAL_QUOTA_DEPENDENCY } from "$lib/load-dependencies";
import { createTimeFormatter, getTodayDateString } from "../../utils/messageUtils";
import { completeAction, postAction, requestAgentOpeningAction } from "../apiService";
import { attemptAgentReply, type SendAttemptResult } from "../chatFlowController";
import { buildChatMessages, type ChatMessage, getSessionSnapshot, updateMessageById } from "../chatMessages";
import ComposeWindow from "./ComposeWindow.svelte";
import { MAIL_AGENT_OPENING_MESSAGE } from "./constants";
import DetailPane from "./DetailPane.svelte";
import { i18n } from "./i18n";
import MessageList from "./MessageList.svelte";
import {
	formatDraftMessage,
	getMailBodyHtmlFromMessage,
	normalizeMailEmails,
	parseDraftFromMessage,
	plainTextToDraftHtml,
	sanitizeDraftBodyHtml,
} from "./mailUtils";
import Overlays from "./Overlays.svelte";
import { buildAgentMessageFromSendResult, buildGeneratedInboxEmails } from "./presentation";
import Sidebar from "./Sidebar.svelte";
import type { DraftEmail, MailOpeningState } from "./types";
import { getMailContact, getMailContactFromOpeningEmails } from "./userPool";

interface Props {
	taskId?: string | number;
	userName?: string;
	avatarUrl?: string;
	language?: string;
	timeZone?: string;
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
	timeZone = "UTC",
	existingSession = null,
	openingState = null,
	maxTurns = 0,
	agentStartsFirst = true,
}: Props = $props();

const t = $derived(i18n[language as keyof typeof i18n] || i18n.en);

function refreshTrialQuota() {
	return invalidate(TRIAL_QUOTA_DEPENDENCY);
}

function refreshPracticeSession() {
	return invalidate(PRACTICE_SESSION_DEPENDENCY);
}

function refreshAfterSendResult(result: SendAttemptResult) {
	if (result.status === "pending") {
		return Promise.all([refreshPracticeSession(), refreshTrialQuota()]);
	}
	return refreshTrialQuota();
}

let sessionId = $state<number | null>(null);
let lastLoadedSessionId = $state<number | null>(null);
let lastSessionSnapshot = $state("");
let isInitializing = $state(false);
let isSubmitting = $state(false);
let isCompleting = $state(false);
let isCompleted = $state(false);
let isEntering = $state(true);
let showToast = $state(false);
let showSidebar = $state(false);
let showCompose = $state(false);
let showFinishConfirm = $state(false);
let messages = $state<ChatMessage[]>([]);
let hasAutoCompleted = $state(false);
let selectedInboxId = $state<string | null>(null);
let selectedSentId = $state<string | null>(null);
let activeMailbox = $state<"inbox" | "sent" | "drafts">("inbox");
let draft = $state<DraftEmail>({ to: "", subject: "", body: "" });
let toastTimeout: ReturnType<typeof setTimeout>;
let messageScroll = $state<HTMLElement | null>(null);

const todayLabel = $derived(getTodayDateString(language, timeZone));
const openingStateData = $derived((openingState ?? {}) as MailOpeningState);
const recipient = $derived(getMailContactFromOpeningEmails(openingStateData.emails, getMailContact(taskId || sessionId || userName)));
const sentMessages = $derived(messages.filter((m) => m.role === "user" && !m.isHidden));
const agentMessages = $derived(messages.filter((m) => m.role === "agent" && !m.isHidden));
const currentTurns = $derived(sentMessages.length);
const isWaitingRetry = $derived(messages.some((m) => m.deliveryState === "failed" && !m.isHidden));
const isAnyMessagePending = $derived(messages.some((m) => m.deliveryState === "pending" && !m.isHidden));
const limitReached = $derived(isCompleted || (maxTurns > 0 && currentTurns >= maxTurns));
const isBusy = $derived(isInitializing || isSubmitting || isCompleting || isAnyMessagePending);
const generatedInboxEmails = $derived(
	buildGeneratedInboxEmails({
		messages,
		agentMessages,
		recipient,
		userName,
		noSubjectLabel: t.noSubject,
		tutorReplyLabel: t.tutorReply,
		fallbackTime: todayLabel,
	}),
);
const inboxEmails = $derived([...normalizeMailEmails(openingStateData.emails, todayLabel), ...generatedInboxEmails]);
const selectedSentMessage = $derived(selectedSentId ? (sentMessages.find((message) => message.id === selectedSentId) ?? null) : null);
const selectedSentEmail = $derived(
	selectedSentMessage ? parseDraftFromMessage(selectedSentMessage.text, t.noSubject, getMailBodyHtmlFromMessage(selectedSentMessage)) : null,
);
const selectedInboxEmail = $derived(
	activeMailbox === "inbox"
		? selectedInboxId
			? (inboxEmails.find((email) => email.id === selectedInboxId) ?? null)
			: (inboxEmails[0] ?? null)
		: null,
);
const sentCount = $derived(sentMessages.length);
const draftCount = $derived(!limitReached && (draft.body.trim() || draft.subject.trim()) ? 1 : 0);
const remainingTurns = $derived(maxTurns > 0 ? Math.max(0, maxTurns - currentTurns) : null);
const canFinish = $derived(Boolean(sessionId) && currentTurns > 0 && !isCompleted && !isInitializing);
const formatTimestamp = $derived(createTimeFormatter(timeZone));

function getDefaultDraft(): DraftEmail {
	return {
		to: recipient.display,
		subject: "",
		body: "",
		bodyHtml: "",
	};
}

function getDraftStorageKey() {
	return `mail-draft:${taskId || "current"}`;
}

function hasDraftContent(value: DraftEmail) {
	return Boolean(value.subject.trim() || value.body.trim());
}

function loadSavedDraft(): DraftEmail {
	const baseDraft = getDefaultDraft();
	if (typeof localStorage === "undefined") return baseDraft;

	try {
		const saved = localStorage.getItem(getDraftStorageKey());
		if (!saved) return baseDraft;
		const parsed = JSON.parse(saved) as Partial<DraftEmail>;
		const body = (typeof parsed.body === "string" ? parsed.body : "").slice(0, MAIL_TEXT_MAX_LENGTH);
		return {
			...baseDraft,
			subject: typeof parsed.subject === "string" ? parsed.subject : baseDraft.subject,
			body,
			bodyHtml: typeof parsed.bodyHtml === "string" ? sanitizeDraftBodyHtml(parsed.bodyHtml) : plainTextToDraftHtml(body),
		};
	} catch {
		return baseDraft;
	}
}

function persistDraft(nextDraft = draft) {
	if (isCompleted || limitReached) return;
	if (typeof localStorage === "undefined") return;

	try {
		const storageKey = getDraftStorageKey();
		const boundedDraft = {
			...nextDraft,
			body: nextDraft.body.slice(0, MAIL_TEXT_MAX_LENGTH),
			bodyHtml: sanitizeDraftBodyHtml(nextDraft.bodyHtml),
		};
		if (!hasDraftContent(boundedDraft)) {
			localStorage.removeItem(storageKey);
			return;
		}

		localStorage.setItem(storageKey, JSON.stringify(boundedDraft));
	} catch {
		// Some browsers can reject storage in restricted contexts; keep the UI usable.
	}
}

function openComposer(useSavedDraft = false) {
	draft = useSavedDraft ? loadSavedDraft() : getDefaultDraft();
	showCompose = true;
	showSidebar = false;
}

function newMessage() {
	selectedInboxId = null;
	selectedSentId = null;
	if (draftCount > 0) {
		showCompose = true;
		showSidebar = false;
		return;
	}
	openComposer();
}

function selectInbox() {
	selectedInboxId = selectedInboxId ?? inboxEmails[0]?.id ?? null;
	selectedSentId = null;
	activeMailbox = "inbox";
	showCompose = false;
	showSidebar = false;
}

function selectSentMailbox() {
	selectedInboxId = null;
	activeMailbox = "sent";
	showSidebar = false;
	showCompose = false;
	if (!selectedSentId && sentMessages.length) {
		selectedSentId = sentMessages.at(-1)?.id ?? sentMessages[0].id;
	}
}

function selectDraftMailbox() {
	selectedInboxId = null;
	selectedSentId = null;
	activeMailbox = "drafts";
	showCompose = false;
	showSidebar = false;
}

function selectSentMessage(messageId: string) {
	selectedInboxId = null;
	selectedSentId = messageId;
	activeMailbox = "sent";
	showCompose = false;
	showSidebar = false;
}

function selectDraftMessage() {
	if (draftCount <= 0) return;
	selectedInboxId = null;
	selectedSentId = null;
	activeMailbox = "drafts";
	showCompose = true;
	showSidebar = false;
}

function selectInboxMessage(messageId: string) {
	selectedInboxId = messageId;
	selectedSentId = null;
	activeMailbox = "inbox";
	showCompose = false;
	showSidebar = false;
}

function handleMockAction() {
	showToast = true;
	if (toastTimeout) clearTimeout(toastTimeout);
	toastTimeout = setTimeout(() => {
		showToast = false;
	}, 3000);
}

async function scrollToMessageBottom() {
	await tick();
	if (messageScroll) messageScroll.scrollTop = messageScroll.scrollHeight;
}

function appendAgentMessageFromSendResult(
	result: SendAttemptResult,
	clientMessageId: string,
	retryText: string,
	agentMessageId = crypto.randomUUID(),
) {
	const agentMessage = buildAgentMessageFromSendResult({
		result,
		clientMessageId,
		retryText,
		recipient,
		timestamp: formatTimestamp(new Date()),
		stillProcessingMessage: t.stillProcessingMessage,
		retryFailedMessage: t.retryFailedMessage,
		id: agentMessageId,
	});
	if (!agentMessage) return;

	messages = [...messages, agentMessage];
	selectedInboxId = `agent-${agentMessage.id}`;
	activeMailbox = "inbox";
}

function handleFinishClick() {
	showFinishConfirm = true;
}

function handleFinishConfirm() {
	showFinishConfirm = false;
	void handleComplete();
}

function handleFinishCancel() {
	showFinishConfirm = false;
}

async function handleComplete(force = false) {
	if (!sessionId || isCompleted || isInitializing || (!force && isSubmitting) || isCompleting) return;

	isCompleting = true;
	try {
		const result = await completeAction(sessionId);
		if (result.type === "success") {
			isCompleted = true;
			if (typeof localStorage !== "undefined") localStorage.removeItem(getDraftStorageKey());
			draft = getDefaultDraft();
			// Navigate to feedback page
			window.location.href = `/task/${taskId}/feedback`;
		} else {
			console.error("Mail completion was rejected:", result);
		}
	} catch (error) {
		console.error("Mail completion failed:", error);
	} finally {
		isCompleting = false;
	}
}

async function handleRetry(messageId: string) {
	if (isSubmitting || isCompleted || isInitializing || !sessionId) return;

	const message = messages.find((m) => m.id === messageId);
	if (!message?.clientMessageId) return;

	messages = updateMessageById(messages, messageId, (m) => ({ ...m, isHidden: true }));
	await scrollToMessageBottom();

	isSubmitting = true;
	try {
		const retryText = message.retryText || message.text;
		const originalUserMessage = messages.find((m) => m.role === "user" && m.clientMessageId === message.clientMessageId);
		const bodyHtml = originalUserMessage ? sanitizeDraftBodyHtml(getMailBodyHtmlFromMessage(originalUserMessage)) : "";
		const result = await attemptAgentReply(sessionId, retryText, message.clientMessageId, bodyHtml ? { bodyHtml } : {});

		appendAgentMessageFromSendResult(result, message.clientMessageId, retryText);
		await refreshAfterSendResult(result);
	} finally {
		await scrollToMessageBottom();
		isSubmitting = false;
	}
}

async function handleSendEmail() {
	if (isSubmitting || isCompleted || isInitializing || !sessionId || limitReached || isWaitingRetry) return;
	if (!draft.to.trim() || !draft.body.trim()) return;

	const currentText = formatDraftMessage(draft, t.noSubject);
	const mailBodyHtml = sanitizeDraftBodyHtml(draft.bodyHtml);
	const clientMessageId = crypto.randomUUID();
	const expectedTurnCount = currentTurns + 1;
	isSubmitting = true;

	const sentMessage: ChatMessage = {
		id: crypto.randomUUID(),
		role: "user",
		text: currentText,
		timestamp: formatTimestamp(new Date()),
		authorName: userName,
		avatar: avatarUrl,
		clientMessageId,
		llmMetadata: { clientMessageId, failed: false, mailBodyHtml },
	};

	messages = [...messages, sentMessage];
	selectedSentId = sentMessage.id;
	activeMailbox = "sent";
	showCompose = false;
	await scrollToMessageBottom();

	try {
		const result = await attemptAgentReply(sessionId, currentText, clientMessageId, { bodyHtml: mailBodyHtml });
		if (result.status === "reply" || result.status === "pending" || result.status === "failed") {
			appendAgentMessageFromSendResult(result, clientMessageId, currentText);
			if (typeof localStorage !== "undefined") localStorage.removeItem(getDraftStorageKey());
			draft = getDefaultDraft();
			if (maxTurns > 0 && expectedTurnCount >= maxTurns && result.status === "reply") {
				await handleComplete(true);
			} else if (result.status === "reply" && result.terminated === true) {
				await handleComplete(true);
			}
			await refreshAfterSendResult(result);
		} else {
			console.error("Mail submission was rejected:", result);
			messages = messages.filter((message) => message.id !== sentMessage.id);
			showCompose = true;
		}
	} catch (error) {
		console.error("Mail submission failed:", error);
		messages = messages.filter((message) => message.id !== sentMessage.id);
		showCompose = true;
	} finally {
		await scrollToMessageBottom();
		isSubmitting = false;
	}
}

function loadExistingSession(session: any) {
	const sessionSnapshot = getSessionSnapshot(session);
	if (session.id === lastLoadedSessionId && sessionSnapshot === lastSessionSnapshot) return;

	lastLoadedSessionId = session.id;
	lastSessionSnapshot = sessionSnapshot;
	sessionId = session.id;
	isCompleted = session.status === "completed" || session.status === "evaluated";

	messages = buildChatMessages({
		rawMessages: session.messages ?? [],
		formatTimestamp,
		userName,
		agentName: t.tutorReply,
		avatarUrl,
		agentColor: "bg-[#3478F6]",
		labels: t,
	});

	const visibleAgentMessages = messages.filter((m) => m.role === "agent" && !m.isHidden);
	const selectedGeneratedInboxExists = selectedInboxId ? visibleAgentMessages.some((message) => `agent-${message.id}` === selectedInboxId) : false;
	if (
		(!selectedInboxId || (activeMailbox === "inbox" && selectedInboxId.startsWith("agent-") && !selectedGeneratedInboxExists)) &&
		visibleAgentMessages.length
	) {
		selectedInboxId = `agent-${visibleAgentMessages.at(-1)?.id}`;
		activeMailbox = "inbox";
		showCompose = false;
	} else if (!selectedSentId && messages.some((m) => m.role === "user" && !m.isHidden)) {
		selectedSentId = messages.filter((m) => m.role === "user" && !m.isHidden).at(-1)?.id ?? null;
		activeMailbox = "sent";
		showCompose = false;
	}
}

$effect(() => {
	if (existingSession) loadExistingSession(existingSession);
});

onMount(async () => {
	setTimeout(() => {
		isEntering = false;
	}, 400);

	const hasExistingMessages =
		Array.isArray(existingSession?.messages) &&
		existingSession.messages.some((message: any) => message.role === "user" || message.role === "assistant");
	const hasTemplateOpeningEmails = Array.isArray(openingStateData.emails) && openingStateData.emails.length > 0;
	const savedDraft = loadSavedDraft();
	const hasSavedDraft = hasDraftContent(savedDraft);
	if (!isCompleted && hasSavedDraft) draft = savedDraft;

	if (!isCompleted && !hasExistingMessages && !hasTemplateOpeningEmails && !agentStartsFirst) {
		openComposer(true);
	}

	if (!hasTemplateOpeningEmails && existingSession?.id && !hasExistingMessages && agentStartsFirst) {
		isInitializing = true;
		try {
			const result = await requestAgentOpeningAction(existingSession.id, MAIL_AGENT_OPENING_MESSAGE);
			if (result.type === "success" && result.data) {
				await Promise.all([refreshPracticeSession(), refreshTrialQuota()]);
			} else {
				openComposer(true);
			}
		} catch (error) {
			console.error("Mail opening message failed:", error);
			openComposer(true);
		} finally {
			isInitializing = false;
		}
	} else if (!existingSession) {
		isInitializing = true;
		try {
			const startResult = await postAction("start", null);
			if (startResult.type === "success" && startResult.data) {
				sessionId = startResult.data.sessionId as number;
				lastLoadedSessionId = sessionId;
				if (agentStartsFirst) {
					if (!hasTemplateOpeningEmails) {
						const openingResult = await requestAgentOpeningAction(sessionId, MAIL_AGENT_OPENING_MESSAGE);
						if (openingResult.type !== "success") openComposer(true);
					}
				} else {
					openComposer(true);
				}
				await Promise.all([refreshPracticeSession(), refreshTrialQuota()]);
			} else {
				console.error("Mail session initialization was rejected:", startResult);
			}
		} catch (error) {
			console.error("Mail session initialization failed:", error);
		} finally {
			isInitializing = false;
		}
	}
});

$effect(() => {
	if (
		limitReached &&
		currentTurns > 0 &&
		!isWaitingRetry &&
		!isAnyMessagePending &&
		!isSubmitting &&
		!isCompleting &&
		!isCompleted &&
		sessionId &&
		!hasAutoCompleted
	) {
		hasAutoCompleted = true;
		void handleComplete(true);
	}
});

$effect(() => {
	if (isAnyMessagePending && !isSubmitting && sessionId) {
		const interval = setInterval(() => {
			void refreshPracticeSession();
			void refreshTrialQuota();
		}, 3000);
		return () => clearInterval(interval);
	}
});
</script>

{#if isEntering}
	<div class="fixed inset-0 z-[3000] flex flex-col items-center justify-center bg-[#ECECF1]" out:fade={{ duration: 180 }}>
		<Mail size={46} class="text-[#3478F6]" />
		<div class="mt-5 flex items-center gap-2">
			<span class="h-2.5 w-2.5 animate-bounce rounded-full bg-[#3478F6]"></span>
			<span class="h-2.5 w-2.5 animate-bounce rounded-full bg-[#3478F6]" style="animation-delay: 0.16s"></span>
			<span class="h-2.5 w-2.5 animate-bounce rounded-full bg-[#3478F6]" style="animation-delay: 0.32s"></span>
		</div>
	</div>
{/if}

<div
	class="mail-shell fixed inset-0 z-[999] h-[100dvh] w-full overflow-hidden bg-[#F5F5F7] text-[#1D1D1F] font-inter-stack selection:bg-[#3478F6] selection:text-white"
>
	<Overlays {showToast} {t} />

	<div
		class="mail-window grid h-full min-h-0 w-full grid-cols-[240px_minmax(280px,360px)_1fr] overflow-hidden border border-black/10 bg-white shadow-2xl"
	>
		<Sidebar
			{showSidebar}
			{activeMailbox}
			returnHref={`/task/${taskId}`}
			inboxCount={inboxEmails.length}
			{sentCount}
			{draftCount}
			{t}
			onNewMessage={newMessage}
			onSelectInbox={selectInbox}
			onSelectSent={selectSentMailbox}
			onSelectDraft={selectDraftMailbox}
			onMockAction={handleMockAction}
		/>

		<MessageList
			{inboxEmails}
			{sentMessages}
			{draft}
			{draftCount}
			{selectedInboxId}
			{selectedSentId}
			activeView={activeMailbox}
			{todayLabel}
			{t}
			onOpenSidebar={() => (showSidebar = true)}
			onSearchFocus={handleMockAction}
			onSelectInboxMessage={selectInboxMessage}
			onSelectSentMessage={selectSentMessage}
			onSelectDraftMessage={selectDraftMessage}
		/>

		<DetailPane
			bind:messageScroll
			{selectedInboxEmail}
			{selectedSentEmail}
			{selectedSentMessage}
			{todayLabel}
			{userName}
			{avatarUrl}
			{isCompleted}
			{isInitializing}
			{isSubmitting}
			{isCompleting}
			{isBusy}
			{t}
			{remainingTurns}
			{canFinish}
			onMockAction={handleMockAction}
			onComplete={handleFinishClick}
			onRetry={handleRetry}
		/>
	</div>

	{#if showSidebar}
		<button type="button" class="sidebar-backdrop" aria-label="Close mailboxes" onclick={() => (showSidebar = false)}></button>
	{/if}

	{#if showCompose}
		<ComposeWindow
			bind:draft
			{isSubmitting}
			{isCompleted}
			{isInitializing}
			{limitReached}
			{sessionId}
			{t}
			{language}
			onClose={() => (showCompose = false)}
			onMockAction={handleMockAction}
			onSend={handleSendEmail}
			onPersistDraft={persistDraft}
		/>
	{/if}

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
.mail-shell {
	font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif;
}

:global(.h-13) {
	height: 52px;
}

:global(.icon-button) {
	display: inline-flex;
	height: 32px;
	width: 32px;
	align-items: center;
	justify-content: center;
	border-radius: 7px;
	color: #3a3a3c;
	transition:
		background-color 120ms ease,
		color 120ms ease;
}

:global(.icon-button:hover) {
	background: rgba(0, 0, 0, 0.08);
	color: #1d1d1f;
}

:global(.mobile-only) {
	display: none;
}

.sidebar-backdrop {
	display: none;
}

@media (max-width: 1120px) {
	.mail-window {
		grid-template-columns: 220px minmax(260px, 330px) 1fr;
	}
}

@media (max-width: 860px) {
	.mail-window {
		grid-template-columns: minmax(250px, 42vw) 1fr;
	}

	:global(.mail-sidebar) {
		position: absolute;
		inset: 0 auto 0 0;
		z-index: 1300;
		width: min(280px, 82vw);
		transform: translateX(-100%);
		transition: transform 180ms ease;
	}

	:global(.mail-sidebar.is-open) {
		transform: translateX(0);
	}

	:global(.mail-list) {
		grid-column: 1;
	}

	:global(.mail-detail) {
		grid-column: 2;
	}

	:global(.mobile-only),
	.sidebar-backdrop {
		display: inline-flex;
	}

	.sidebar-backdrop {
		position: absolute;
		inset: 0;
		z-index: 1250;
		background: rgba(0, 0, 0, 0.18);
	}
}

@media (max-width: 640px) {
	.mail-window {
		grid-template-columns: 1fr;
		grid-template-rows: 42dvh 1fr;
	}

	:global(.mail-list) {
		grid-column: 1;
		grid-row: 1;
		border-bottom: 1px solid rgba(0, 0, 0, 0.1);
		border-right: 0;
	}

	:global(.mail-detail) {
		grid-column: 1;
		grid-row: 2;
		min-height: 0;
	}

	:global(.mail-detail .toolbar) {
		gap: 0.15rem;
		padding-inline: 0.45rem;
	}
}
</style>
