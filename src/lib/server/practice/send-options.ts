import { eq } from "drizzle-orm";
import type { UiVariant } from "$lib/constants";
import { type CommentThreadMetadata, findThreadTarget, newCommentMetadata, type ThreadUi } from "$lib/practice/comment-thread";
import { buildChatMessages, type PersistedPracticeMessage } from "$lib/practice/messages";
import { db } from "$lib/server/db";
import { practiceSession } from "$lib/server/db/schema";
import { orderSessionMessagesChronologically, type SubmitMessageOptions } from "$lib/server/practice/session";

type PracticeUiSendOptionsResult = { ok: true; options: SubmitMessageOptions } | { ok: false; status: number; error: string };

type PersistedMetadata = { clientMessageId?: string; failed?: boolean; displayContent?: string; thread?: CommentThreadMetadata };

function metadataOf(value: unknown): PersistedMetadata {
	return value && typeof value === "object" && !Array.isArray(value) ? (value as PersistedMetadata) : {};
}

/**
 * Where a Reddit/AO3 comment goes and who answers it. A retry of a failed comment keeps its
 * original placement; a new comment must target an existing comment (or none, for top level).
 * Returns null for an unknown target.
 */
export function buildThreadSendOptions(params: {
	ui: ThreadUi;
	openingState: unknown;
	messages: PersistedPracticeMessage[];
	targetCommentId: string | null;
	message: string;
	clientMessageId: string;
	userName: string;
}): SubmitMessageOptions | null {
	const failedOriginal = params.messages
		.filter((message) => message.role === "user")
		.map((message) => metadataOf(message.llmMetadata))
		.find((metadata) => metadata.clientMessageId === params.clientMessageId && metadata.failed === true && metadata.thread);
	if (failedOriginal?.thread) return { userDisplayContent: failedOriginal.displayContent, userMetadata: { thread: failedOriginal.thread } };

	const chatMessages = buildChatMessages({ rawMessages: params.messages, formatTimestamp: () => "", userName: params.userName, agentName: "" });
	const target = findThreadTarget(params.ui, params.openingState, chatMessages, params.targetCommentId);
	if (params.targetCommentId && !target) return null;

	return {
		userDisplayContent: params.message,
		userMetadata: { thread: newCommentMetadata(params.ui, params.clientMessageId, target, params.openingState).user },
	};
}

export async function buildPracticeUiSendOptions(params: {
	ui: UiVariant;
	formData: FormData;
	openingState: unknown;
	sessionId: number;
	message: string;
	clientMessageId: string;
	userName: string;
}): Promise<PracticeUiSendOptionsResult> {
	if (params.ui !== "reddit" && params.ui !== "ao3") return { ok: true, options: {} };
	if (!params.clientMessageId) return { ok: false, status: 400, error: "clientMessageId is required for comments" };

	const session = await db.query.practiceSession.findFirst({
		where: eq(practiceSession.id, params.sessionId),
		with: { messages: { orderBy: orderSessionMessagesChronologically } },
	});
	const target = params.formData.get("threadTargetCommentId");
	const options = buildThreadSendOptions({
		ui: params.ui,
		openingState: params.openingState,
		messages: session?.messages ?? [],
		targetCommentId: typeof target === "string" && target.trim() ? target.trim() : null,
		message: params.message,
		clientMessageId: params.clientMessageId,
		userName: params.userName,
	});
	if (!options) return { ok: false, status: 400, error: "Invalid reply target" };
	return { ok: true, options };
}
