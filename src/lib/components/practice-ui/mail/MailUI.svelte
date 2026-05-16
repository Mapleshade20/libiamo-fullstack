<script lang="ts">
import Mail from "@lucide/svelte/icons/mail";
import { onMount, tick } from "svelte";
import { fade } from "svelte/transition";
import { deserialize } from "$app/forms";
import { invalidateAll } from "$app/navigation";
import { formatTime, getTodayDateString } from "../../utils/messageUtils";
import { postAction } from "../apiService";
import { buildChatMessages, type ChatMessage } from "../chatMessages";
import type { TutorFeedback } from "../types";
import ComposeWindow from "./ComposeWindow.svelte";
import DetailPane from "./DetailPane.svelte";
import { i18n } from "./i18n";
import MessageList from "./MessageList.svelte";
import { formatDraftMessage, parseDraftFromMessage } from "./mailUtils";
import Overlays from "./Overlays.svelte";
import Sidebar from "./Sidebar.svelte";
import type { DraftEmail, MailHint } from "./types";
import { getMailContact } from "./userPool";

interface Props {
	taskId?: string | number;
	userName?: string;
	avatarUrl?: string;
	language?: string;
	existingSession?: any;
}

let { taskId = "", userName = "Learner", avatarUrl = "", language = "en", existingSession = null }: Props = $props();

const t = $derived(i18n[language as keyof typeof i18n] || i18n.en);

let sessionId = $state<number | null>(null);
let lastLoadedSessionId = $state<number | null>(null);
let lastServerMessageCount = $state(0);
let isInitializing = $state(false);
let isSubmitting = $state(false);
let isCompleted = $state(false);
let isEntering = $state(true);
let showEvaluationModal = $state(false);
let showToast = $state(false);
let showSidebar = $state(false);
let showCompose = $state(false);
let showHintPanel = $state(false);
let isGettingHint = $state(false);
let feedback = $state<TutorFeedback | null>(null);
let mailHint = $state<MailHint | null>(null);
let messages = $state<ChatMessage[]>([]);
let selectedSentId = $state<string | null>(null);
let draft = $state<DraftEmail>({ to: "", subject: "", body: "" });
let draftStorageReady = $state(false);
let toastTimeout: ReturnType<typeof setTimeout>;
let messageScroll = $state<HTMLElement | null>(null);
let hintAbortController: AbortController | null = null;

const recipient = $derived(getMailContact(taskId || sessionId || userName));
const inboxEmails = $derived([]);
const sentMessages = $derived(messages.filter((m) => m.role === "user" && !m.isHidden));
const hasSubmittedEmail = $derived(sentMessages.length > 0);
const limitReached = $derived(hasSubmittedEmail || isCompleted);
const isBusy = $derived(isInitializing || isSubmitting);
const selectedSentMessage = $derived(selectedSentId ? (sentMessages.find((message) => message.id === selectedSentId) ?? null) : null);
const selectedSentEmail = $derived(selectedSentMessage ? parseDraftFromMessage(selectedSentMessage.text, t.noSubject) : null);
const activeView = $derived(selectedSentMessage ? "sent" : "inbox");
const sentCount = $derived(sentMessages.length);
const draftCount = $derived(!hasSubmittedEmail && (draft.body.trim() || draft.subject.trim()) ? 1 : 0);
const todayLabel = $derived(getTodayDateString(language));

function getDefaultDraft(): DraftEmail {
	return {
		to: recipient.display,
		subject: "",
		body: "",
		bodyAlign: "left",
	};
}

function getDraftStorageKey() {
	return `mail-draft:${taskId || "current"}`;
}

function loadSavedDraft(): DraftEmail {
	const baseDraft = getDefaultDraft();
	if (typeof localStorage === "undefined") return baseDraft;

	try {
		const saved = localStorage.getItem(getDraftStorageKey());
		if (!saved) return baseDraft;
		const parsed = JSON.parse(saved) as Partial<DraftEmail>;
		const bodyAlign: DraftEmail["bodyAlign"] = parsed.bodyAlign === "right" ? "right" : "left";
		return {
			...baseDraft,
			subject: typeof parsed.subject === "string" ? parsed.subject : baseDraft.subject,
			body: typeof parsed.body === "string" ? parsed.body : "",
			bodyAlign,
		};
	} catch {
		return baseDraft;
	}
}

function openComposer(useSavedDraft = false) {
	draft = useSavedDraft ? loadSavedDraft() : getDefaultDraft();
	mailHint = null;
	showCompose = true;
	showSidebar = false;
}

function newMessage() {
	selectedSentId = null;
	if (draftCount > 0) {
		showCompose = true;
		showSidebar = false;
		return;
	}
	openComposer();
}

function openDraft() {
	selectedSentId = null;
	showCompose = true;
	showSidebar = false;
}

function selectSentMessage(messageId: string) {
	selectedSentId = messageId;
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

async function submitOneShotEmail(sessionId: number, messageText: string, clientMessageId: string) {
	const formData = new FormData();
	formData.append("sessionId", String(sessionId));
	formData.append("message", messageText);
	formData.append("clientMessageId", clientMessageId);

	const res = await fetch(`?/submit`, {
		method: "POST",
		body: formData,
	});
	return deserialize(await res.text());
}

async function handleGetHint() {
	if (isGettingHint) {
		showHintPanel = true;
		return;
	}
	if (!sessionId || isCompleted || isInitializing || limitReached) return;

	isGettingHint = true;
	showHintPanel = true;
	mailHint = null;
	hintAbortController = new AbortController();

	try {
		const formData = new FormData();
		formData.append("sessionId", String(sessionId));
		formData.append("to", draft.to);
		formData.append("subject", draft.subject);
		formData.append("body", draft.body);

		const res = await fetch(`?/hint`, {
			method: "POST",
			body: formData,
			signal: hintAbortController.signal,
		});
		const result = deserialize(await res.text());
		if (result.type === "success" && result.data) {
			mailHint = (result.data as any).mailHint as MailHint;
		}
	} catch (error) {
		if (error instanceof DOMException && error.name === "AbortError") {
			console.log("Mail hint request was aborted by user.");
		} else {
			console.error("Failed to get mail hints:", error);
		}
	} finally {
		isGettingHint = false;
		hintAbortController = null;
	}
}

function closeHintPanel() {
	showHintPanel = false;
	if (isGettingHint && hintAbortController) {
		hintAbortController.abort();
		isGettingHint = false;
		hintAbortController = null;
	}
}

function insertHintText(text: string) {
	const trimmedText = text.trim();
	if (!trimmedText) return;
	const trimmedBody = draft.body.trimEnd();
	draft = {
		...draft,
		body: trimmedBody ? `${trimmedBody}\n\n${trimmedText}` : trimmedText,
	};
}

async function handleSendEmail() {
	if (isSubmitting || isCompleted || isInitializing || !sessionId || limitReached) return;
	if (!draft.to.trim() || !draft.body.trim()) return;

	const currentText = formatDraftMessage(draft, t.noSubject);
	const clientMessageId = crypto.randomUUID();
	isSubmitting = true;

	const sentMessage: ChatMessage = {
		id: crypto.randomUUID(),
		role: "user",
		text: currentText,
		timestamp: formatTime(new Date()),
		authorName: userName,
		avatar: avatarUrl,
		clientMessageId,
	};

	messages = [...messages, sentMessage];
	selectedSentId = sentMessage.id;
	showCompose = false;
	await scrollToMessageBottom();

	try {
		const result = await submitOneShotEmail(sessionId, currentText, clientMessageId);
		if (result.type === "success" && result.data) {
			isCompleted = true;
			feedback = result.data.feedback as TutorFeedback;
			showEvaluationModal = true;
			if (typeof localStorage !== "undefined") localStorage.removeItem(getDraftStorageKey());
			await invalidateAll();
		} else {
			messages = messages.filter((message) => message.id !== sentMessage.id);
			showCompose = true;
		}
	} catch (error) {
		console.error("One-shot submission failed:", error);
		messages = messages.filter((message) => message.id !== sentMessage.id);
		showCompose = true;
	} finally {
		await scrollToMessageBottom();
		isSubmitting = false;
	}
}

function loadExistingSession(session: any) {
	const serverMsgCount = session.messages?.length || 0;
	if (session.id === lastLoadedSessionId && serverMsgCount <= lastServerMessageCount) return;

	lastLoadedSessionId = session.id;
	lastServerMessageCount = serverMsgCount;
	sessionId = session.id;
	isCompleted = session.status === "completed" || session.status === "evaluated";
	feedback = session.tutorFeedback || null;

	const sortedRawMessages = [...(session.messages ?? [])].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
	messages = buildChatMessages({
		rawMessages: sortedRawMessages,
		formatTimestamp: formatTime,
		userName,
		agentName: t.tutorReply,
		avatarUrl,
		agentColor: "bg-[#3478F6]",
		labels: t,
	});

	if (isCompleted && feedback) showEvaluationModal = true;
	if (!selectedSentId && messages.some((m) => m.role === "user" && !m.isHidden)) {
		selectedSentId = messages.filter((m) => m.role === "user" && !m.isHidden).at(-1)?.id ?? null;
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

	if (!existingSession) {
		isInitializing = true;
		try {
			const startResult = await postAction("start", null);
			if (startResult.type === "success" && startResult.data) {
				const currentId = startResult.data.sessionId as number;
				sessionId = currentId;
				lastLoadedSessionId = currentId;
				await invalidateAll();
			}
		} catch (error) {
			console.error("Initialization failed:", error);
		} finally {
			isInitializing = false;
		}
	}

	const hasExistingSubmission = Array.isArray(existingSession?.messages) && existingSession.messages.some((message: any) => message.role === "user");
	if (!isCompleted && !hasExistingSubmission) {
		openComposer(true);
		draftStorageReady = true;
	}
});

$effect(() => {
	if (!showCompose) closeHintPanel();
});

$effect(() => {
	if (!draftStorageReady || isCompleted || hasSubmittedEmail) return;
	if (typeof localStorage === "undefined") return;
	localStorage.setItem(getDraftStorageKey(), JSON.stringify(draft));
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
	class="mail-shell fixed inset-0 z-[999] h-[100dvh] w-full overflow-hidden bg-[#F5F5F7] text-[#1D1D1F] selection:bg-[#3478F6] selection:text-white"
>
	<Overlays {showEvaluationModal} {feedback} {showToast} {t} onCloseEvaluation={() => (showEvaluationModal = false)} />

	<div class="mail-window grid h-full w-full grid-cols-[240px_minmax(280px,360px)_1fr] overflow-hidden border border-black/10 bg-white shadow-2xl">
		<Sidebar
			{showSidebar}
			returnHref={`/task/${taskId}`}
			inboxCount={inboxEmails.length}
			{sentCount}
			{draftCount}
			{t}
			onNewMessage={newMessage}
			onSelectInbox={handleMockAction}
			onSelectSent={() => sentMessages[0] && selectSentMessage(sentMessages.at(-1)?.id ?? sentMessages[0].id)}
			onSelectDraft={openDraft}
			onMockAction={handleMockAction}
		/>

		<MessageList
			{inboxEmails}
			{sentMessages}
			{selectedSentId}
			{activeView}
			{todayLabel}
			{t}
			onOpenSidebar={() => (showSidebar = true)}
			onSearchFocus={handleMockAction}
			onSelectSentMessage={selectSentMessage}
		/>

		<DetailPane
			bind:messageScroll
			{selectedSentEmail}
			{selectedSentMessage}
			{todayLabel}
			{userName}
			{avatarUrl}
			{isCompleted}
			{isInitializing}
			{isSubmitting}
			{isBusy}
			{t}
			onMockAction={handleMockAction}
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
			hint={mailHint}
			{isGettingHint}
			{showHintPanel}
			{t}
			onClose={() => (showCompose = false)}
			onMockAction={handleMockAction}
			onSend={handleSendEmail}
			onGetHint={handleGetHint}
			onCloseHint={closeHintPanel}
			onInsertHint={insertHintText}
		/>
	{/if}
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
