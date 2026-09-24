import { deserialize } from "$app/forms";

const AGENT_REPLY_TIMEOUT_MS = 25_000;

export type MessageSubmissionResult =
	| { status: "pending" }
	| { status: "failed"; error?: string }
	| { status: "rejected" }
	| { status: "session_completed"; completionReason?: string };

function actionErrorMessage(result: unknown): string | undefined {
	if (!result || typeof result !== "object") return undefined;
	const data = (result as { data?: unknown }).data;
	if (!data || typeof data !== "object") return undefined;
	const error = (data as { error?: unknown }).error;
	return typeof error === "string" && error.trim() ? error : undefined;
}

export async function submitPracticeMessage(
	sessionId: number,
	messageText: string,
	clientMessageId: string,
	extraFields: Record<string, string> = {},
): Promise<MessageSubmissionResult> {
	const formData = new FormData();
	formData.append("sessionId", String(sessionId));
	formData.append("message", messageText);
	formData.append("clientMessageId", clientMessageId);
	// Append extra fields (e.g. ao3-specific metadata)
	for (const [key, value] of Object.entries(extraFields)) {
		formData.append(key, value);
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

		if (result?.type === "failure") {
			const error = actionErrorMessage(result);
			if (error) return { status: "failed", error };
			if (result.status >= 400 && result.status < 500) return { status: "rejected" };
			return { status: "failed" };
		}

		if (result?.type === "success" && result.data) {
			if ((result.data as any).sessionCompleted) {
				return { status: "session_completed", completionReason: (result.data as any).completionReason };
			}
			if ((result.data as any).pending) {
				return { status: "pending" };
			}
			return { status: "failed" };
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
