import { submitAgentReply } from "../apiService";
import type { ChatMessage } from "../chatMessages";
import { retryManager } from "./retryManager";

export interface FlowCallbacks {
	formatTime: (date: Date) => string;
	onStart?: () => void;
	onUpdateMessage: (id: string, updates: Partial<ChatMessage>) => void;
	onCreateAgentMessage: (params: {
		id: string;
		text: string;
		state: "pending" | "sent" | "failed";
		timestamp: string;
		clientMessageId?: string;
	}) => void;
	onScrollToBottom: () => Promise<void>;
	onComplete: () => Promise<void>;
	onInvalidate: () => Promise<void>;
	labels: {
		stillProcessing: string;
		retryFailed: string;
	};
}

export async function runAgentReplyWorkflow(
	sessionId: number,
	clientMessageId: string,
	messageText: string,
	existingAgentMessageId: string | null,
	callbacks: FlowCallbacks,
) {
	let agentMessageId = existingAgentMessageId;

	if (agentMessageId && callbacks.onStart) {
		callbacks.onStart();
	}

	try {
		while (true) {
			let sendResult: any = null;
			try {
				sendResult = await submitAgentReply(sessionId, messageText, clientMessageId);
			} catch (error) {
				console.error("Message submission failed:", error);
			}
			if (sendResult?.type === "failure" && sendResult.status >= 400 && sendResult.status < 500) {
				console.warn("Backend rejected the message:", sendResult.data?.error);
				break;
			}
			if (sendResult?.type === "success" && sendResult.data) {
				if (sendResult.data.pending) {
					const timestamp = callbacks.formatTime(new Date());
					if (!agentMessageId) {
						agentMessageId = crypto.randomUUID();
						callbacks.onCreateAgentMessage({
							id: agentMessageId,
							text: callbacks.labels.stillProcessing,
							state: "pending",
							timestamp,
							clientMessageId,
						});
					} else {
						callbacks.onUpdateMessage(agentMessageId, {
							text: callbacks.labels.stillProcessing,
							deliveryState: "pending",
							isHidden: false,
							timestamp,
						});
					}
					await callbacks.onScrollToBottom();

					await retryManager.waitForRetry(agentMessageId);
					continue;
				}

				const finalTimestamp = callbacks.formatTime(new Date());
				if (agentMessageId) {
					callbacks.onUpdateMessage(agentMessageId, {
						text: sendResult.data.reply as string,
						deliveryState: "sent",
						isHidden: false,
						timestamp: finalTimestamp,
					});
				} else {
					callbacks.onCreateAgentMessage({
						id: crypto.randomUUID(),
						text: sendResult.data.reply as string,
						state: "sent",
						timestamp: finalTimestamp,
					});
				}

				await callbacks.onScrollToBottom();
				await callbacks.onInvalidate();

				if (sendResult.data.terminated) {
					await callbacks.onComplete();
				}
				break;
			}

			const failedTimestamp = callbacks.formatTime(new Date());
			if (!agentMessageId) {
				agentMessageId = crypto.randomUUID();
				callbacks.onCreateAgentMessage({
					id: agentMessageId,
					text: callbacks.labels.retryFailed,
					state: "failed",
					timestamp: failedTimestamp,
				});
			} else {
				callbacks.onUpdateMessage(agentMessageId, {
					text: callbacks.labels.retryFailed,
					deliveryState: "failed",
					isHidden: false,
					timestamp: failedTimestamp,
				});
			}
			await callbacks.onScrollToBottom();

			await retryManager.waitForRetry(agentMessageId);
		}
	} finally {
		if (agentMessageId) {
			retryManager.clear(agentMessageId);
		}
	}
}
