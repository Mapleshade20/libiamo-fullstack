import type { ChatMessage } from "../chatMessages";

/**
 * Id of the earliest user message the agent has not answered yet. Only persisted
 * messages carry numeric ids; fresh client-side messages (uuids) return null.
 */
export function getFirstUnansweredUserMessageId(messages: ChatMessage[]): number | null {
	let lastAgentIndex = -1;
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		const message = messages[index];
		// Pending placeholders are polling vessels rendered as nothing; they must
		// not count as an answer when looking for the first unanswered message.
		if (message?.role === "agent" && !message.isHidden && message.deliveryState !== "pending") {
			lastAgentIndex = index;
			break;
		}
	}
	for (let index = lastAgentIndex + 1; index < messages.length; index += 1) {
		const message = messages[index];
		if (message?.role === "user" && /^\d+$/.test(message.id)) return Number.parseInt(message.id, 10);
	}
	return null;
}

/**
 * Whether the reply worker has claimed the pending batch (the read watermark
 * advanced to the first unanswered message). That claim is the moment the agent
 * "noticed" the learner and started composing, so Discord's typing indicator is
 * shown only from then on — not as an instant placeholder after sending.
 */
export function hasAgentStartedComposing(messages: ChatMessage[], agentReadUpToMessageId: number | null): boolean {
	if (agentReadUpToMessageId === null) return false;
	const firstUnansweredId = getFirstUnansweredUserMessageId(messages);
	return firstUnansweredId !== null && agentReadUpToMessageId >= firstUnansweredId;
}
