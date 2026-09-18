import type { LanguageCode, PracticeSessionStatus } from "$lib/constants";
import type { ChatMessage } from "./chatMessages";
import type { CommentThreadMetadata } from "./commentThread";

export type { PracticeSessionStatus } from "$lib/constants";

/** Persisted metadata is extensible; presentation helpers still validate values before use. */
export interface PracticeMessageMetadata {
	[key: string]: unknown;
	clientMessageId?: string;
	failed?: boolean;
	noReply?: boolean;
	failureError?: string | null;
	hidden?: boolean;
	displayContent?: string;
	assistantAuthorName?: string;
	mailBodyHtml?: string;
	thread?: CommentThreadMetadata;
}

export interface PersistedPracticeMessage {
	id: number;
	role: "user" | "assistant";
	content: string;
	createdAt: Date;
	llmMetadata: PracticeMessageMetadata | null;
}

export interface PracticeSessionSnapshot {
	id: number;
	status: PracticeSessionStatus;
	messages: PersistedPracticeMessage[];
	agentReadUpToMessageId: number | null;
	maxTurnsSnapshot: number | null;
	nextAgentWorkDueAt: Date | null;
	/** Retained while the existing snapshot reconciler uses feedback presence. */
	tutorFeedback: unknown;
}

export interface PracticeAgentPresentation {
	name: string;
	avatarUrl?: string;
	accentClass?: string;
}

export interface PracticeUiRootProps {
	taskId: string;
	userName: string;
	avatarUrl: string;
	language: LanguageCode;
	existingSession: PracticeSessionSnapshot | null;
	openingState: unknown;
	maxTurns: number;
	returnHref: string;
	feedbackHref: string;
}

/** Rejections before submission have no allocated client or optimistic message ID. */
export type PracticeSendOutcome =
	| { status: "rejected"; clientMessageId: string | null; optimisticMessageId: string | null }
	| { status: "pending"; clientMessageId: string; optimisticMessageId: string }
	| { status: "failed"; clientMessageId: string; optimisticMessageId: string; error?: string }
	| { status: "session_completed"; clientMessageId: string; optimisticMessageId: string; completionReason?: string };

export type PracticeCompletionOutcome = { status: "completed" } | { status: "pending" } | { status: "failed"; error: string };

/** Raw opening fields are normalized by presentation helpers, never by the runtime. */
export interface PracticeOpeningMessage {
	sender?: unknown;
	author?: unknown;
	text?: unknown;
	content?: unknown;
}

export interface PracticeOpeningState {
	previousMessages?: PracticeOpeningMessage[];
}

export interface PracticeParticipant {
	id: string;
	name: string;
	status: string;
	color: string;
	isAgent: boolean;
}

export interface PracticePresentation<Context> {
	agent: PracticeAgentPresentation;
	context: Context;
}

export type PracticeMessagePresentationPatch = Partial<
	Pick<ChatMessage, "text" | "authorName" | "avatar" | "avatarColor" | "isHidden" | "thread" | "llmMetadata">
>;

/** Presentation only: no requests, invalidation, timers, or navigation. */
export interface PracticePresentationAdapter<Opening = PracticeOpeningState, Context = undefined> {
	normalizeOpeningState: (value: unknown) => Opening;
	resolvePresentation: (input: { sessionId: number | null; openingState: Opening; userName: string }) => PracticePresentation<Context>;
	buildOpeningMessages: (input: {
		openingState: Opening;
		presentation: PracticePresentation<Context>;
		userName: string;
		avatarUrl: string;
		earlier: string;
	}) => ChatMessage[];
	retryFields?: (originalMessage: ChatMessage | undefined) => Record<string, string>;
	messagePatch?: (message: ChatMessage) => PracticeMessagePresentationPatch;
	beforeFeedbackNavigation?: () => void;
}
