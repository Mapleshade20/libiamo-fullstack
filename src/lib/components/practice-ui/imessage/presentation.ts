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
