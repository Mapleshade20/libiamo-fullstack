import { refreshTrialQuota } from "$lib/components/account/trial-quota";
import { actionError, postPageAction } from "../session/actions";

export type HintMode = "content" | "expression";

/** What the learner is writing and, in threads, the comments it answers. */
export type HintContext = {
	draft: string;
	contextPath?: Array<{ author: string; text: string }>;
};

export type HintResponse = {
	contentHint?: string;
	phrases?: string[];
};

export async function requestHint(input: HintContext & { sessionId: number; mode: HintMode; expression?: string }): Promise<HintResponse> {
	const result = await postPageAction("hint", {
		sessionId: input.sessionId,
		mode: input.mode,
		draft: input.draft.trim(),
		expression: input.expression?.trim(),
		contextPath: input.contextPath?.length ? JSON.stringify(input.contextPath) : undefined,
	});
	void refreshTrialQuota();
	if (result.type !== "success" || !result.data) throw new Error(actionError(result) ?? "");

	return {
		contentHint: typeof result.data.contentHint === "string" ? result.data.contentHint : undefined,
		phrases: Array.isArray(result.data.phrases) ? result.data.phrases.filter((phrase): phrase is string => typeof phrase === "string") : undefined,
	};
}
