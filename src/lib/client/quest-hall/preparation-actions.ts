import type { ActionResult } from "@sveltejs/kit";

type UpdateAction = (options?: { reset?: boolean; invalidateAll?: boolean }) => Promise<void>;

function failureMessage(result: ActionResult): string | null {
	if (result.type !== "failure" || !result.data || typeof result.data !== "object") return null;
	const error = "error" in result.data ? result.data.error : null;
	return typeof error === "string" && error.trim() ? error : null;
}

export async function handlePreparationActionResult(result: ActionResult, update: UpdateAction, fallbackError: string): Promise<string | null> {
	const error = failureMessage(result);
	if (result.type === "failure") return error ?? fallbackError;
	await update({ reset: false });
	return null;
}
