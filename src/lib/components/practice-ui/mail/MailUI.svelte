<script lang="ts">
import Mail from "@lucide/svelte/icons/mail";
import { onMount, tick } from "svelte";
import { fade } from "svelte/transition";
import { base } from "$app/paths";
import { MAIL_TEXT_MAX_LENGTH } from "$lib/constants";
import { getDisplayClock } from "$lib/display-clock";
import { getTodayDateString } from "../../utils/messageUtils";
import FinishSessionSheet from "../FinishSessionSheet.svelte";
import { createPracticeSession } from "../session.svelte";
import type { PracticeUiRootProps } from "../types";
import { createMailPresentationAdapter } from "./adapter";
import ComposeWindow from "./ComposeWindow.svelte";
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
import { buildGeneratedInboxEmails } from "./presentation";
import Sidebar from "./Sidebar.svelte";
import type { DraftEmail, MailOpeningState } from "./types";

const clock = getDisplayClock();

let { taskId, userName, avatarUrl, language, existingSession, openingState, maxTurns, returnHref, feedbackHref }: PracticeUiRootProps = $props();

const t = $derived(i18n[language as keyof typeof i18n] || i18n.en);

const sessionLabels = {
	get stillProcessingMessage() {
		return t.stillProcessingMessage;
	},
	get retryFailedMessage() {
		return t.retryFailedMessage;
	},
	earlier: "",
};
const adapter = createMailPresentationAdapter(
	() => taskId,
	() => userName,
);
const session = createPracticeSession(() => ({
	adapter,
	userName,
	avatarUrl,
	language,
	existingSession,
	openingState,
	maxTurns,
	feedbackHref,
	labels: sessionLabels,
	taskId,
}));
const sessionId = $derived(session.sessionId);
const messages = $derived(session.messages);
const isInitializing = $derived(session.isInitializing);
const isSubmitting = $derived(session.isSubmitting);
const isCompleting = $derived(session.isCompleting);
const isCompleted = $derived(session.isCompleted);
let isEntering = $state(true);
let showToast = $state(false);
let showSidebar = $state(false);
let showCompose = $state(false);
let showFinishConfirm = $state(false);
let hasAutoCompleted = $state(false);
let selectedInboxId = $state<string | null>(null);
let selectedSentId = $state<string | null>(null);
let activeMailbox = $state<"inbox" | "sent" | "drafts">("inbox");
let draft = $state<DraftEmail>({ to: "", subject: "", body: "" });
let toastTimeout: ReturnType<typeof setTimeout>;
let messageScroll = $state<HTMLElement | null>(null);

const todayLabel = $derived(getTodayDateString(language, clock()));
const openingStateData = $derived((openingState ?? {}) as MailOpeningState);
const recipient = $derived(session.presentationContext.recipient);
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

function handleFinishClick() {
	showFinishConfirm = true;
}

function handleFinishConfirm() {
	void session.handleCompleteAndNavigate();
}

function handleFinishCancel() {
	showFinishConfirm = false;
	session.clearCompletionError();
}

async function handleRetry(messageId: string) {
	await session.handleRetry(messageId);
	await scrollToMessageBottom();
}

async function handleSendEmail() {
	if (isSubmitting || isCompleted || isInitializing || !sessionId || limitReached || isWaitingRetry) return;
	if (!draft.to.trim() || !draft.body.trim()) return;

	const currentText = formatDraftMessage(draft, t.noSubject);
	const mailBodyHtml = sanitizeDraftBodyHtml(draft.bodyHtml);
	showCompose = false;
	await scrollToMessageBottom();
	const outcome = await session.handleSend({
		message: currentText,
		extraFields: { bodyHtml: mailBodyHtml },
		messagePatches: { user: { llmMetadata: { failed: false, mailBodyHtml } } },
	});
	if (outcome.status === "rejected") {
		showCompose = true;
		return;
	}
	draft = getDefaultDraft();
	if (typeof localStorage !== "undefined") localStorage.removeItem(getDraftStorageKey());
}

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

	if (!isCompleted && !hasExistingMessages && !hasTemplateOpeningEmails) {
		openComposer(true);
	}
});

$effect(() => {
	if (session.completionError !== null) showFinishConfirm = true;
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
		void session.handleCompleteAndNavigate();
	}
});

$effect(() => {
	const visibleAgentMessages = agentMessages.filter((message) => message.deliveryState !== "pending");
	const selectedGeneratedInboxExists = selectedInboxId ? visibleAgentMessages.some((message) => `agent-${message.id}` === selectedInboxId) : false;
	if (
		(!selectedInboxId || (activeMailbox === "inbox" && selectedInboxId.startsWith("agent-") && !selectedGeneratedInboxExists)) &&
		visibleAgentMessages.length
	) {
		selectedInboxId = `agent-${visibleAgentMessages.at(-1)?.id}`;
		activeMailbox = "inbox";
		showCompose = false;
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
			returnHref={returnHref || `${base}/task/${taskId}`}
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

	<FinishSessionSheet
		show={showFinishConfirm}
		{language}
		pending={session.isCompleting}
		error={session.completionError}
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
		grid-template-columns: minmax(0, 42vw) minmax(0, 1fr);
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
		grid-template-columns: minmax(0, 1fr);
		grid-template-rows: minmax(0, min(28dvh, 240px)) minmax(0, 1fr);
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
