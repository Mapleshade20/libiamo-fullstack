import { deserialize } from "$app/forms";

export const AGENT_REPLY_TIMEOUT_MS = 25_000;

export async function submitAgentReply(sessionId: number | string, messageText: string, clientMessageId: string) {
	const sendData = new FormData();
	sendData.append("sessionId", String(sessionId));
	sendData.append("message", messageText);
	sendData.append("clientMessageId", clientMessageId);

	const controller = new AbortController();
	const timeoutId = setTimeout(() => {
		controller.abort();
	}, AGENT_REPLY_TIMEOUT_MS);

	try {
		const sendRes = await fetch(`?/send`, {
			method: "POST",
			body: sendData,
			signal: controller.signal,
		});
		return deserialize(await sendRes.text());
	} catch (error) {
		if (error instanceof DOMException && error.name === "AbortError") {
			throw new Error(`Agent reply timed out after ${AGENT_REPLY_TIMEOUT_MS / 1000}s`);
		}
		throw error;
	} finally {
		clearTimeout(timeoutId);
	}
}

export async function postAction(action: string, sessionId: number | string | null) {
	const formData = new FormData();
	if (sessionId != null && sessionId !== "") formData.append("sessionId", String(sessionId));
	const res = await fetch(`?/${action}`, {
		method: "POST",
		body: formData,
	});
	return deserialize(await res.text());
}
