import { deserialize } from "$app/forms";

export async function postAction(action: string, sessionId: number | string | null) {
	const formData = new FormData();
	if (sessionId != null && sessionId !== "") formData.append("sessionId", String(sessionId));
	const res = await fetch(`?/${action}`, {
		method: "POST",
		body: formData,
	});
	return deserialize(await res.text());
}

export function completeAction(sessionId: number | string) {
	return postAction("complete", sessionId);
}

export async function sendFormAction(action: string, formData: FormData, signal?: AbortSignal) {
	const res = await fetch(`?/${action}`, {
		method: "POST",
		body: formData,
		signal,
	});
	return deserialize(await res.text());
}

export function requestAgentFirstReplyAction(sessionId: number | string) {
	const formData = new FormData();
	formData.append("sessionId", String(sessionId));
	formData.append("clientMessageId", `join-${sessionId}`);
	return sendFormAction("agentOpening", formData);
}

export function requestAgentOpeningAction(sessionId: number | string, message: string) {
	const formData = new FormData();
	formData.append("sessionId", String(sessionId));
	formData.append("message", message);
	formData.append("clientMessageId", `join-${sessionId}`);
	return sendFormAction("send", formData);
}
