import type { ChatMessage } from "../chatMessages";

export type BubbleGroupPosition = "single" | "start" | "middle" | "end";

function isRenderableMessage(message: ChatMessage) {
	return !message.isHidden && message.deliveryState !== "pending";
}

export function getRenderableMessages(messages: ChatMessage[]): ChatMessage[] {
	return messages.filter(isRenderableMessage);
}

export function getBubbleGroupPosition(messages: ChatMessage[], index: number): BubbleGroupPosition {
	const current = messages[index];
	if (!current) return "single";

	const prev = index > 0 ? messages[index - 1] : null;
	const next = index < messages.length - 1 ? messages[index + 1] : null;
	const hasPrevSameRole = prev?.role === current.role;
	const hasNextSameRole = next?.role === current.role;

	if (hasPrevSameRole && hasNextSameRole) return "middle";
	if (hasPrevSameRole) return "end";
	if (hasNextSameRole) return "start";
	return "single";
}

export function getLastOutgoingMessageId(messages: ChatMessage[]): string | null {
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		if (messages[index]?.role === "user") return messages[index].id;
	}
	return null;
}

/**
 * Whether the contact has read the learner's last outgoing message. Read becomes
 * visible once the worker claims the reply batch (advancing the persisted read
 * watermark) or once any agent message follows it (restored sessions, retries).
 */
export function isLastOutgoingMessageRead(messages: ChatMessage[], agentReadUpToMessageId: number | null): boolean {
	let lastIndex = -1;
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		if (messages[index]?.role === "user") {
			lastIndex = index;
			break;
		}
	}
	if (lastIndex === -1) return false;

	const lastId = messages[lastIndex].id;
	// Persisted messages use numeric db ids; fresh client-side messages use uuids,
	// which must never satisfy the watermark comparison (even digit-prefixed ones).
	if (/^\d+$/.test(lastId) && Number.parseInt(lastId, 10) <= (agentReadUpToMessageId ?? 0)) return true;

	return messages.slice(lastIndex + 1).some((message) => message.role === "agent");
}
