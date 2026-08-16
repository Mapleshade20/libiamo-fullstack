import { error, fail } from "@sveltejs/kit";
import { z } from "zod";
import { dev } from "$app/environment";
import { PRACTICE_UI_TEXT_MAX_LENGTH } from "$lib/constants";
import { requireUser } from "$lib/server/auth/authz";
import { llmErrorMessage, llmErrorStatus } from "$lib/server/llm";
import { generateTranslationEvaluation } from "$lib/server/translation-evaluation/generation";
import { GENERATION_2_TEMPERATURE, generateTranslationPractice } from "$lib/server/translation-evaluation/practice-generation";
import {
	buildCorrectionVerifierMessages,
	buildGeneration1Messages,
	buildGeneration2Messages,
	buildSecondDraftVerifierMessages,
	type Generation1Input,
} from "$lib/server/translation-evaluation/prompt";
import type { ValidatedGeneration1Card } from "$lib/server/translation-evaluation/validation";
import { verifyCorrection, verifySecondDraft } from "$lib/server/translation-evaluation/verifier";
import { LIVE_DEMO_TEMPERATURE, TRANSLATION_EVALUATION_LIVE_DEMO_TASK } from "$lib/translation-evaluation/live-demo-fixture";
import type { Actions, PageServerLoad } from "./$types";

const LearnerParagraphsSchema = z
	.array(z.string().trim().min(1).max(PRACTICE_UI_TEXT_MAX_LENGTH))
	.length(TRANSLATION_EVALUATION_LIVE_DEMO_TASK.sourceParagraphs.length);
const TemperatureSchema = z.number().finite().min(LIVE_DEMO_TEMPERATURE.min).max(LIVE_DEMO_TEMPERATURE.max);
const ChatMessageSchema = z.object({ role: z.enum(["system", "user", "assistant"]), content: z.string() }).strict();
const Generation1MessagesSchema = z.array(ChatMessageSchema).min(1).max(12);
const CardContextSchema = z
	.object({
		ordinal: z.number().int().nonnegative(),
		sourceText: z.string().trim().min(1).max(PRACTICE_UI_TEXT_MAX_LENGTH),
		originalAnswer: z.string().trim().min(1).max(PRACTICE_UI_TEXT_MAX_LENGTH),
		initialHint: z.string().trim().min(1).max(PRACTICE_UI_TEXT_MAX_LENGTH),
		deeperHint: z.string().trim().min(1).max(PRACTICE_UI_TEXT_MAX_LENGTH),
		referenceAnswer: z.string().trim().min(1).max(PRACTICE_UI_TEXT_MAX_LENGTH),
		minimalAnswer: z.string().trim().min(1).max(PRACTICE_UI_TEXT_MAX_LENGTH),
		teacherNotes: z.array(z.string().trim().min(1).max(PRACTICE_UI_TEXT_MAX_LENGTH)).min(1).max(20),
	})
	.strict();
const CardOutcomesSchema = z.array(z.object({ ordinal: z.number().int().nonnegative(), outcome: z.enum(["passed", "revealed"]) }).strict());
const Generation2CardsSchema = z.array(CardContextSchema).min(1);
const LIVE_ARTIFACT_MAX_LENGTH = 1_000_000;

function requireDevelopmentRoute(): void {
	if (!dev) error(404, "Not found");
}

function generationInput(learnerParagraphs: string[]): Generation1Input {
	const task = TRANSLATION_EVALUATION_LIVE_DEMO_TASK;
	return {
		sourceParagraphs: [...task.sourceParagraphs],
		learnerParagraphs,
		referenceParagraphs: [...task.referenceParagraphs],
		sourceLanguage: task.sourceLanguage,
		targetLanguage: task.targetLanguage,
		feedbackLanguage: task.feedbackLanguage,
		context: task.context,
	};
}

function parseLearnerParagraphs(formData: FormData) {
	const raw = formData.get("learnerParagraphs");
	if (typeof raw !== "string" || raw.length > PRACTICE_UI_TEXT_MAX_LENGTH * TRANSLATION_EVALUATION_LIVE_DEMO_TASK.sourceParagraphs.length + 100) {
		return null;
	}
	try {
		const result = LearnerParagraphsSchema.safeParse(JSON.parse(raw));
		return result.success ? result.data : null;
	} catch {
		return null;
	}
}

function parseTemperature(formData: FormData): number | null {
	const raw = formData.get("temperature");
	if (raw === null) return LIVE_DEMO_TEMPERATURE.default;
	if (typeof raw !== "string" || !raw.trim()) return null;
	const result = TemperatureSchema.safeParse(Number(raw));
	return result.success ? result.data : null;
}

function parseJsonField<T>(formData: FormData, name: string, schema: z.ZodType<T>, maxLength = LIVE_ARTIFACT_MAX_LENGTH): T | null {
	const raw = formData.get(name);
	if (typeof raw !== "string" || raw.length > maxLength) return null;
	try {
		const result = schema.safeParse(JSON.parse(raw));
		return result.success ? result.data : null;
	} catch {
		return null;
	}
}

function parseTextField(formData: FormData, name: string, maxLength = PRACTICE_UI_TEXT_MAX_LENGTH): string | null {
	const raw = formData.get(name);
	return typeof raw === "string" && raw.trim() && raw.length <= maxLength ? raw : null;
}

function parseGeneration1History(formData: FormData, learnerParagraphs: string[]) {
	const requestMessages = parseJsonField(formData, "generation1PromptMessages", Generation1MessagesSchema);
	const rawResponse = parseTextField(formData, "generation1RawResponse", LIVE_ARTIFACT_MAX_LENGTH);
	if (!requestMessages || !rawResponse) return null;
	const canonicalMessages = buildGeneration1Messages(generationInput(learnerParagraphs));
	if (requestMessages.length < canonicalMessages.length) return null;
	const hasCanonicalPrefix = canonicalMessages.every(
		(message, index) => requestMessages[index]?.role === message.role && requestMessages[index]?.content === message.content,
	);
	if (!hasCanonicalPrefix) return null;
	return [...requestMessages, { role: "assistant" as const, content: rawResponse }];
}

function validatedCard(card: z.infer<typeof CardContextSchema>): ValidatedGeneration1Card {
	return {
		...card,
		referenceMarked: "card-only live-demo context",
		minimalDiff: "card-only live-demo context",
		sourceRange: null,
		answerRange: null,
		minimalDiffParts: null,
		referenceMarkedParts: null,
		warnings: [],
	};
}

function callMetadata(
	response: {
		model?: string;
		finishReason: string | null;
		usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
		requestMessages: unknown[];
	},
	initialMessageCount: number,
	startedAt: number,
	temperature: number,
) {
	return {
		temperature,
		model: response.model ?? null,
		finishReason: response.finishReason,
		usage: response.usage ?? null,
		durationMs: Math.round(performance.now() - startedAt),
		repairUsed: response.requestMessages.length > initialMessageCount,
	};
}

export const load: PageServerLoad = async () => {
	requireDevelopmentRoute();
	const learnerParagraphs = [...TRANSLATION_EVALUATION_LIVE_DEMO_TASK.defaultLearnerParagraphs];
	return {
		task: TRANSLATION_EVALUATION_LIVE_DEMO_TASK,
		promptMessages: buildGeneration1Messages(generationInput(learnerParagraphs)),
	};
};

export const actions: Actions = {
	evaluate: async (event) => {
		requireDevelopmentRoute();
		const user = requireUser(event);
		const formData = await event.request.formData();
		const learnerParagraphs = parseLearnerParagraphs(formData);
		if (!learnerParagraphs) return fail(400, { error: "Provide one non-empty answer for every paragraph." });
		const temperature = parseTemperature(formData);
		if (temperature === null) return fail(400, { error: "Temperature must be a number from 0 to 1." });

		const input = generationInput(learnerParagraphs);
		const initialPromptMessages = buildGeneration1Messages(input);
		const startedAt = performance.now();
		try {
			const response = await generateTranslationEvaluation({ ...input, userId: user.id, temperature });
			return {
				success: true,
				learnerParagraphs,
				evaluation: response.value,
				promptMessages: response.requestMessages,
				rawResponse: response.content,
				metadata: {
					...callMetadata(response, initialPromptMessages.length, startedAt, temperature),
				},
			};
		} catch (cause) {
			return fail(llmErrorStatus(cause), {
				error: llmErrorMessage(cause),
				promptMessages: initialPromptMessages,
			});
		}
	},
	verifyCorrection: async (event) => {
		requireDevelopmentRoute();
		const user = requireUser(event);
		const formData = await event.request.formData();
		const card = parseJsonField(formData, "card", CardContextSchema);
		const learnerRevision = parseTextField(formData, "learnerRevision");
		const displayedHint = parseTextField(formData, "displayedHint");
		if (!card || !learnerRevision || !displayedHint || (displayedHint !== card.initialHint && displayedHint !== card.deeperHint)) {
			return fail(400, { error: "The correction-verifier experiment data was invalid." });
		}

		const correctionInput = {
			card: validatedCard(card),
			learnerRevision,
			displayedHint,
			targetLanguage: TRANSLATION_EVALUATION_LIVE_DEMO_TASK.targetLanguage,
			feedbackLanguage: TRANSLATION_EVALUATION_LIVE_DEMO_TASK.feedbackLanguage,
		};
		const initialMessages = buildCorrectionVerifierMessages(correctionInput);
		const startedAt = performance.now();
		try {
			const response = await verifyCorrection({ ...correctionInput, userId: user.id });
			return {
				success: true,
				verification: response.value,
				promptMessages: response.requestMessages,
				rawResponse: response.content,
				metadata: callMetadata(response, initialMessages.length, startedAt, 0.2),
			};
		} catch (cause) {
			return fail(llmErrorStatus(cause), {
				error: llmErrorMessage(cause),
				promptMessages: initialMessages,
			});
		}
	},
	verifySecondDraft: async (event) => {
		requireDevelopmentRoute();
		const user = requireUser(event);
		const formData = await event.request.formData();
		const learnerParagraphs = parseLearnerParagraphs(formData);
		const generation1History = learnerParagraphs ? parseGeneration1History(formData, learnerParagraphs) : null;
		const secondDraftParagraphs = parseJsonField(formData, "secondDraftParagraphs", LearnerParagraphsSchema);
		const cardOutcomes = parseJsonField(formData, "cardOutcomes", CardOutcomesSchema);
		if (!learnerParagraphs || !generation1History || !secondDraftParagraphs || !cardOutcomes) {
			return fail(400, { error: "The second-draft verifier data was invalid." });
		}
		const input = {
			generation1History,
			secondDraftParagraphs,
			cardCount: cardOutcomes.length,
			cardOutcomes,
			targetLanguage: TRANSLATION_EVALUATION_LIVE_DEMO_TASK.targetLanguage,
			feedbackLanguage: TRANSLATION_EVALUATION_LIVE_DEMO_TASK.feedbackLanguage,
		};
		const initialMessages = buildSecondDraftVerifierMessages(input);
		const startedAt = performance.now();
		try {
			const response = await verifySecondDraft({ ...input, userId: user.id });
			return {
				success: true,
				verification: response.value,
				promptMessages: response.requestMessages,
				rawResponse: response.content,
				metadata: callMetadata(response, initialMessages.length, startedAt, 0.2),
			};
		} catch (cause) {
			return fail(llmErrorStatus(cause), {
				error: llmErrorMessage(cause),
				promptMessages: initialMessages,
			});
		}
	},
	generatePractice: async (event) => {
		requireDevelopmentRoute();
		const user = requireUser(event);
		const formData = await event.request.formData();
		const cards = parseJsonField(formData, "cards", Generation2CardsSchema);
		if (!cards) return fail(400, { error: "The Generation 2 card data was invalid." });
		const input = {
			cards: cards.map(validatedCard),
			sourceLanguage: TRANSLATION_EVALUATION_LIVE_DEMO_TASK.sourceLanguage,
			targetLanguage: TRANSLATION_EVALUATION_LIVE_DEMO_TASK.targetLanguage,
		};
		const initialMessages = buildGeneration2Messages(input);
		const startedAt = performance.now();
		try {
			const response = await generateTranslationPractice({ ...input, userId: user.id });
			return {
				success: true,
				generation: response.value,
				promptMessages: response.requestMessages,
				rawResponse: response.content,
				metadata: callMetadata(response, initialMessages.length, startedAt, GENERATION_2_TEMPERATURE),
			};
		} catch (cause) {
			return fail(llmErrorStatus(cause), {
				error: llmErrorMessage(cause),
				promptMessages: initialMessages,
			});
		}
	},
};
