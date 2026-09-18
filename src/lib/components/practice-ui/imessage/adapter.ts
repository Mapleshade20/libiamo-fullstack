import { createChatPresentationAdapter } from "../presentationAdapter";

export function createIMessagePresentationAdapter() {
	return {
		...createChatPresentationAdapter(),
	};
}
