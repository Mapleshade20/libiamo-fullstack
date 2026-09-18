import { sendFormAction } from "../apiService";
import { getHintLabels } from "./i18n";

export type HintRequest = {
	sessionId: number;
	signal?: AbortSignal;
	language?: string;
	mode: "content" | "expression";
	draft?: string;
	expression?: string;
	contextPath?: Array<{ author: string; text: string }>;
};

export type HintResponse = {
	contentHint?: string;
	phrases?: string[];
};

export async function requestHint(input: HintRequest): Promise<HintResponse> {
	const formData = new FormData();
	formData.append("sessionId", String(input.sessionId));
	formData.append("mode", input.mode);
	if (input.draft?.trim()) formData.append("draft", input.draft.trim());
	if (input.expression?.trim()) formData.append("expression", input.expression.trim());
	if (input.contextPath?.length) formData.append("contextPath", JSON.stringify(input.contextPath));

	const result = await sendFormAction("hint", formData, input.signal);
	if (result?.type === "failure") {
		const error = result.data && typeof result.data.error === "string" ? result.data.error : getHintLabels(input.language ?? "en").failure;
		throw new Error(error);
	}
	if (result?.type !== "success" || !result.data) throw new Error(getHintLabels(input.language ?? "en").failure);

	return {
		contentHint: typeof result.data.contentHint === "string" ? result.data.contentHint : undefined,
		phrases: Array.isArray(result.data.phrases) ? result.data.phrases.filter((phrase): phrase is string => typeof phrase === "string") : undefined,
	};
}
