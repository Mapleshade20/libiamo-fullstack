import { eq } from "drizzle-orm";
import type { ExchangePlace } from "#lib/constants.ts";
import { type CommentThreadMetadata, findThreadTarget, getSceneMessageRef, newCommentMetadata, type ThreadUi } from "#lib/exchange/comment-thread.ts";
import { buildChatMessages, buildOpeningMessages, type ChatOpeningState, type PersistedExchangeMessage } from "#lib/exchange/messages.ts";
import { db } from "#lib/server/db/index.ts";
import { exchange } from "#lib/server/db/schema.ts";
import { orderSessionMessagesChronologically, type SubmitMessageOptions } from "#lib/server/exchange/exchanges.ts";

type SendOptionsResult = { ok: true; options: SubmitMessageOptions } | { ok: false; status: number; error: string };

type PersistedMetadata = { clientMessageId?: string; failed?: boolean; displayContent?: string; thread?: CommentThreadMetadata };

function metadataOf(value: unknown): PersistedMetadata {
	return value && typeof value === "object" && !Array.isArray(value) ? (value as PersistedMetadata) : {};
}

/**
 * Where a Reddit/AO3 comment goes. A retry of a failed comment keeps its
 * original placement; a new comment must target an existing comment (or none, for top level).
 * Returns null for an unknown target.
 */
export function buildThreadSendOptions(params: {
	ui: ThreadUi;
	openingState: unknown;
	messages: PersistedExchangeMessage[];
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
		userMetadata: { thread: newCommentMetadata(params.ui, params.clientMessageId, target) },
	};
}

/**
 * The message a Discord reply quotes. It must be one the learner can see: an opening line or a
 * delivered session message, never a placeholder. Returns null for an unknown target.
 */
export function buildChatReplySendOptions(params: {
	ui: "discord";
	openingState: unknown;
	messages: PersistedExchangeMessage[];
	replyTo: string;
	userName: string;
}): SubmitMessageOptions | null {
	const visible = [
		...buildOpeningMessages((params.openingState ?? {}) as ChatOpeningState, params.userName, ""),
		...buildChatMessages({ rawMessages: params.messages, formatTimestamp: () => "", userName: params.userName, agentName: "" }),
	].filter((message) => !message.deliveryState);
	if (!visible.some((message) => getSceneMessageRef(params.ui, message) === params.replyTo)) return null;
	return { userMetadata: { replyTo: params.replyTo } };
}

async function loadSessionMessages(exchangeId: number): Promise<PersistedExchangeMessage[]> {
	const session = await db.query.exchange.findFirst({
		where: eq(exchange.id, exchangeId),
		with: { messages: { orderBy: orderSessionMessagesChronologically } },
	});
	return session?.messages ?? [];
}

/** What a message's place-specific fields mean for how it is stored: the comment it answers, the message it quotes. */
export async function sendOptionsFor(params: {
	ui: ExchangePlace;
	fields: Record<string, string>;
	openingState: unknown;
	exchangeId: number;
	message: string;
	clientMessageId: string;
	userName: string;
}): Promise<SendOptionsResult> {
	if (params.ui === "discord") {
		const replyTo = params.fields.replyTo;
		if (typeof replyTo !== "string" || !replyTo.trim()) return { ok: true, options: {} };
		const options = buildChatReplySendOptions({
			ui: params.ui,
			openingState: params.openingState,
			messages: await loadSessionMessages(params.exchangeId),
			replyTo: replyTo.trim(),
			userName: params.userName,
		});
		if (!options) return { ok: false, status: 400, error: "Invalid reply target" };
		return { ok: true, options };
	}
	if (params.ui !== "reddit" && params.ui !== "ao3") return { ok: true, options: {} };
	if (!params.clientMessageId) return { ok: false, status: 400, error: "clientMessageId is required for comments" };

	const target = params.fields.threadTargetCommentId;
	const options = buildThreadSendOptions({
		ui: params.ui,
		openingState: params.openingState,
		messages: await loadSessionMessages(params.exchangeId),
		targetCommentId: typeof target === "string" && target.trim() ? target.trim() : null,
		message: params.message,
		clientMessageId: params.clientMessageId,
		userName: params.userName,
	});
	if (!options) return { ok: false, status: 400, error: "Invalid reply target" };
	return { ok: true, options };
}
