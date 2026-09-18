import type { ChatMessage } from "../chatMessages";
import type { PracticePresentationAdapter } from "../types";
import { type Ao3OpeningState, getAo3AuthorName } from "./helpers";

export function createAo3PresentationAdapter(): PracticePresentationAdapter<Ao3OpeningState, undefined> & {
	retryFields: (message: ChatMessage | undefined) => Record<string, string>;
} {
	return {
		normalizeOpeningState: (value) => (value && typeof value === "object" ? (value as Ao3OpeningState) : {}),
		resolvePresentation: ({ openingState }) => ({ agent: { name: getAo3AuthorName(openingState, "FicAuthor") }, context: undefined }),
		buildOpeningMessages: () => [],
		retryFields: (message: ChatMessage | undefined): Record<string, string> =>
			message?.thread?.targetCommentId ? { threadTargetCommentId: message.thread.targetCommentId } : {},
	};
}
