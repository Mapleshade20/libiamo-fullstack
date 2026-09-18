import type { ChatMessage } from "../chatMessages";
import { createChatPresentationAdapter } from "../presentationAdapter";

export function createAo3PresentationAdapter() {
	return {
		...createChatPresentationAdapter(),
		retryFields: (message: ChatMessage | undefined): Record<string, string> =>
			message?.thread?.targetCommentId ? { threadTargetCommentId: message.thread.targetCommentId } : {},
	};
}
