import { deserialize } from "$app/forms";

const AGENT_REPLY_TIMEOUT_MS = 25_000;

export type SendAttemptResult =
	| { status: "reply"; text: string; terminated: boolean }
	| { status: "pending" }
	| { status: "failed" }
	| { status: "rejected" };

export async function attemptAgentReply(
	sessionId: number,
	messageText: string,
	clientMessageId: string,
	extraFields: Record<string, string> = {},
	parentId?: string,
): Promise<SendAttemptResult> {
	const formData = new FormData();
	formData.append("sessionId", String(sessionId));
	formData.append("message", messageText);
	formData.append("clientMessageId", clientMessageId);

	// Append extra fields (e.g. ao3-specific metadata)
	for (const [key, value] of Object.entries(extraFields)) {
		formData.append(key, value);
	}

	// Persist parentId in metadata so tree structure survives page refresh (reddit)
	if (parentId) {
		formData.append("parentId", parentId);
	}

	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), AGENT_REPLY_TIMEOUT_MS);

	try {
		const res = await fetch(`?/send`, {
			method: "POST",
			body: formData,
			signal: controller.signal,
		});
		const result = deserialize(await res.text());

		if (result?.type === "failure" && result.status >= 400 && result.status < 500) {
			return { status: "rejected" };
		}

		if (result?.type === "success" && result.data) {
			if ((result.data as any).pending) {
				return { status: "pending" };
			}
			return {
				status: "reply",
				text: result.data.reply as string,
				terminated: (result.data as any).terminated ?? false,
			};
		}

		return { status: "failed" };
	} catch (error) {
		if (error instanceof DOMException && error.name === "AbortError") {
			console.error(`Agent reply timed out after ${AGENT_REPLY_TIMEOUT_MS / 1000}s`);
		} else {
			console.error("Message submission failed:", error);
		}
		return { status: "failed" };
	} finally {
		clearTimeout(timeoutId);
	}
}
