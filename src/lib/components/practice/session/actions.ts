import type { ActionResult } from "@sveltejs/kit";
import { deserialize } from "$app/forms";

const AGENT_REPLY_TIMEOUT_MS = 25_000;

export type SendResult = { status: "pending" } | { status: "failed"; error?: string } | { status: "rejected" } | { status: "session_completed" };

type Fields = Record<string, string | number | null | undefined>;

/**
 * Posts a form action of the current session page. The page's own query (a pinned `?lineup=`)
 * is kept: SvelteKit reads any `/name` search parameter as the action.
 */
export async function postPageAction(action: string, fields: Fields = {}, signal?: AbortSignal): Promise<ActionResult> {
	const url = new URL(window.location.href);
	url.searchParams.append(`/${action}`, "");
	const body = new FormData();
	for (const [key, value] of Object.entries(fields)) {
		if (value !== null && value !== undefined && value !== "") body.append(key, String(value));
	}
	const response = await fetch(url, { method: "POST", body, signal });
	return deserialize(await response.text());
}

export function actionError(result: ActionResult): string | undefined {
	const error = result.type === "failure" ? (result.data as { error?: unknown } | undefined)?.error : undefined;
	return typeof error === "string" && error.trim() ? error : undefined;
}

/** Submits one learner message; the reply is composed asynchronously by the worker. */
export async function sendMessage(sessionId: number, text: string, clientMessageId: string, fields: Fields = {}): Promise<SendResult> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), AGENT_REPLY_TIMEOUT_MS);
	try {
		const result = await postPageAction("send", { ...fields, sessionId, message: text, clientMessageId }, controller.signal);
		if (result.type === "failure") {
			const error = actionError(result);
			if (error) return { status: "failed", error };
			return result.status < 500 ? { status: "rejected" } : { status: "failed" };
		}
		if (result.type === "success" && result.data?.sessionCompleted) return { status: "session_completed" };
		if (result.type === "success" && result.data?.pending) return { status: "pending" };
		return { status: "failed" };
	} catch (error) {
		console.error("Message submission failed:", error);
		return { status: "failed" };
	} finally {
		clearTimeout(timeout);
	}
}
