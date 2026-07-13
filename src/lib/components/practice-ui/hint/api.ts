import { sendFormAction } from "../apiService";

export type HintRequest = {
	sessionId: number;
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

	const result = await sendFormAction("hint", formData);
	if (result?.type === "failure") {
		const error = result.data && typeof result.data.error === "string" ? result.data.error : "Failed to generate hints";
		throw new Error(error);
	}
	if (result?.type !== "success" || !result.data) throw new Error("Failed to generate hints");

	return {
		contentHint: typeof result.data.contentHint === "string" ? result.data.contentHint : undefined,
		phrases: Array.isArray(result.data.phrases) ? result.data.phrases.filter((phrase): phrase is string => typeof phrase === "string") : undefined,
	};
}
