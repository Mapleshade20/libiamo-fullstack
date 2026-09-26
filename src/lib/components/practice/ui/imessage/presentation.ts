import type { ChatMessage } from "$lib/practice/messages";

export type BubbleGroupPosition = "single" | "start" | "middle" | "end";

/** Pending placeholders only drive polling; iMessage shows read receipts and typing instead. */
export function getRenderableMessages(messages: ChatMessage[]): ChatMessage[] {
	return messages.filter((message) => message.deliveryState !== "pending");
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

const GROUPED_CORNERS: Record<ChatMessage["role"], Record<Exclude<BubbleGroupPosition, "single">, string>> = {
	user: { start: "rounded-br-md", middle: "rounded-tr-md rounded-br-md", end: "rounded-tr-md" },
	agent: { start: "rounded-bl-md", middle: "rounded-tl-md rounded-bl-md", end: "rounded-tl-md" },
};

/** Consecutive bubbles from one side tuck their inner corners together, as in Messages. */
export function getBubbleCorners(messages: ChatMessage[], index: number): string {
	const position = getBubbleGroupPosition(messages, index);
	const role = messages[index]?.role ?? "user";
	return position === "single" ? "" : GROUPED_CORNERS[role][position];
}
