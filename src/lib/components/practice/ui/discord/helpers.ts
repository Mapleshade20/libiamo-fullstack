import type { ChatMessage } from "$lib/practice/messages";

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
		if (message?.role === "agent" && message.deliveryState !== "pending") {
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

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

function mentionPattern(names: string[]): RegExp | null {
	const known = [...new Set(names.filter(Boolean))].sort((a, b) => b.length - a.length);
	// Longest first, so `@Nova` does not claim the start of `@NovaStar`.
	return known.length ? new RegExp(`(^|[^\\p{L}\\p{N}_])@(${known.map(escapeRegExp).join("|")})(?![\\p{L}\\p{N}_])`, "giu") : null;
}

/**
 * Markdown with `@Name` of known members wrapped as Discord mention pills. Code spans are left
 * alone, and the result still goes through the sanitizing markdown renderer.
 */
export function highlightMentions(text: string, names: string[]): string {
	const pattern = mentionPattern(names);
	if (!pattern) return text;
	return text
		.split(/(`[^`]*`)/)
		.map((part, index) =>
			index % 2 ? part : part.replace(pattern, (_, lead: string, name: string) => `${lead}<span class="discord-mention">@${escapeHtml(name)}</span>`),
		)
		.join("");
}

/** Whether a message @mentions someone, as Discord highlights messages that ping you. */
export function mentionsName(text: string, name: string): boolean {
	const pattern = mentionPattern([name]);
	return pattern?.test(text) ?? false;
}

/** The `@query` being typed right before the caret, or null. Names may use any script. */
export function getMentionQuery(text: string, caret: number): { start: number; query: string } | null {
	const match = text.slice(0, caret).match(/(?:^|\s)@([^\s@]*)$/u);
	return match ? { start: caret - match[1].length - 1, query: match[1] } : null;
}
