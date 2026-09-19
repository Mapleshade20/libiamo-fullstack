import type { ChatMessage } from "../chatMessages";
import { createChatPresentationAdapter } from "../presentationAdapter";
import { getRedditFallbackAuthor, getRedditPostAuthor } from "./helpers";
import type { RedditOpeningState } from "./types";
import { getAvatarColor } from "./utils";

export function createRedditPresentationAdapter() {
	return {
		...createChatPresentationAdapter(),
		resolvePresentation: ({ openingState, sessionId }: { openingState: unknown; sessionId: number | null; userName: string }) => {
			const state = openingState as RedditOpeningState;
			const name = getRedditPostAuthor(state, getRedditFallbackAuthor(`${sessionId ?? "scene"}:post`));
			const agent = { name, accentClass: getAvatarColor(name) };
			return { agent, context: agent };
		},
		retryFields: (message: ChatMessage | undefined): Record<string, string> =>
			message?.thread?.targetCommentId ? { threadTargetCommentId: message.thread.targetCommentId } : {},
	};
}
