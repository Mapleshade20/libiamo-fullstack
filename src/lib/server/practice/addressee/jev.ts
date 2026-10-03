/**
 * The Decisions API of TypeSafe's Jev on OpenRouter (alpha): a typed Choice with probabilities,
 * no generated text. Only this file knows the wire format, so an API change stays here. It never
 * throws: any failure is null, and callers fall back to what they did without it.
 */
import { z } from "zod";

const DECISIONS_URL = "https://openrouter.ai/api/alpha/decisions";
const TIMEOUT_MS = 4_000;

export type JevChoiceQuestion = {
	instructions: string;
	/** Option key → what choosing it means. */
	criteria: Record<string, string>;
};

export type JevChoice = { choice: string; probabilities: Record<string, number> };

const responseSchema = z.object({
	answers: z.object({
		question: z.object({ choice: z.string(), probabilities: z.record(z.string(), z.number()).default({}) }),
	}),
});

export async function askJevChoice(input: {
	apiKey: string;
	model: string;
	state: unknown;
	question: JevChoiceQuestion;
	fetch?: typeof globalThis.fetch;
}): Promise<JevChoice | null> {
	try {
		const response = await (input.fetch ?? globalThis.fetch)(DECISIONS_URL, {
			method: "POST",
			headers: { Authorization: `Bearer ${input.apiKey}`, "Content-Type": "application/json" },
			body: JSON.stringify({ model: input.model, state: input.state, questions: { question: { type: "choice", ...input.question } } }),
			signal: AbortSignal.timeout(TIMEOUT_MS),
		});
		if (!response.ok) {
			console.warn(`Jev decision failed: HTTP ${response.status}`);
			return null;
		}
		const parsed = responseSchema.safeParse(await response.json());
		if (!parsed.success || !(parsed.data.answers.question.choice in input.question.criteria)) {
			console.warn("Jev decision had an unexpected shape");
			return null;
		}
		return parsed.data.answers.question;
	} catch (error) {
		console.warn("Jev decision failed:", error instanceof Error ? error.message : error);
		return null;
	}
}
