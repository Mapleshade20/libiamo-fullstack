import type { ChatMessage } from "../chatMessages";
import { createChatPresentationAdapter } from "../presentationAdapter";
import type { RedditOpeningState } from "./types";
import { getAvatarColor } from "./utils";

export function createRedditPresentationAdapter() {
	return {
		...createChatPresentationAdapter(),
		resolvePresentation: ({ openingState }: { openingState: unknown; sessionId: number | null; userName: string }) => {
			const name = (openingState as RedditOpeningState)?.post?.author || "unknown";
			const agent = { name, accentClass: getAvatarColor(name) };
			return { agent, context: agent };
		},
		retryFields: (message: ChatMessage | undefined): Record<string, string> =>
			message?.thread?.targetCommentId ? { threadTargetCommentId: message.thread.targetCommentId } : {},
	};
}
