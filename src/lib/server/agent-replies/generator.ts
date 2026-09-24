import { z } from "zod";
import type { UiVariant } from "$lib/constants";
import { type AgentEvent, type AgentTaskContext, buildAgentMessages, isThreadedUi } from "$lib/server/agent-replies/prompt";
import { type ChatMessage, chatJson, type StructuredOutputErrorDetails } from "$lib/server/llm";

/**
 * Models often drop a key whose value is null, or echo a numeric id as a string. Neither is worth
 * a repair round trip, so a missing target reads as null and a numeric string as its number.
 */
const replyTargetSchema = z
	.union([
		z.number().int().positive(),
		z
			.string()
			.regex(/^[1-9]\d*$/)
			.transform(Number),
		z.null(),
	])
	.optional()
	.transform((value) => value ?? null);

const deliverySchema = z.object({
	content: z.string().trim().min(1).max(50_000),
	replyToMessageId: replyTargetSchema,
});

export const agentResponseDecisionSchema = z
	.object({
		decision: z.enum(["reply", "no_reply", "terminate_abuse"]),
		deliveries: z.array(deliverySchema),
		allowIdleFollowUp: z.boolean(),
		terminationReason: z.string().trim().min(1).max(1_000).nullable(),
	})
	.superRefine((value, ctx) => {
		if (value.decision === "reply" && value.deliveries.length === 0) {
			ctx.addIssue({ code: "custom", path: ["deliveries"], message: "reply requires at least one delivery" });
		}
		if (value.decision === "no_reply" && value.deliveries.length !== 0) {
			ctx.addIssue({ code: "custom", path: ["deliveries"], message: "no_reply cannot contain deliveries" });
		}
		if (value.decision === "terminate_abuse" && value.deliveries.length > 1) {
			ctx.addIssue({ code: "custom", path: ["deliveries"], message: "terminate_abuse allows at most one final delivery" });
		}
		if (value.decision === "terminate_abuse" && !value.terminationReason) {
			ctx.addIssue({ code: "custom", path: ["terminationReason"], message: "terminate_abuse requires a reason" });
		}
		if (value.decision !== "terminate_abuse" && value.terminationReason !== null) {
			ctx.addIssue({ code: "custom", path: ["terminationReason"], message: "terminationReason is reserved for terminate_abuse" });
		}
	});

export type AgentResponseDecision = z.infer<typeof agentResponseDecisionSchema>;

export type AgentHistoryMessage = {
	id: number;
	role: "user" | "assistant";
	content: string;
	llmMetadata?: unknown;
};

export type AgentGenerationArtifacts = {
	requestMessages: ChatMessage[];
	rawResponse: string;
	parsedResult: AgentResponseDecision;
	providerMetadata: {
		id?: string;
		model?: string;
		finishReason: string | null;
		usage?: unknown;
		quota?: unknown;
		raw: unknown;
		repair: null | { initialContent: string; initialRaw: unknown; errors: string[] };
		contractWarnings?: string[];
	};
};

/** Failure evidence available even when generation does not produce a parsed result. */
export type AgentGenerationFailureArtifacts = {
	requestMessages: ChatMessage[];
	rawResponse: string | null;
	providerMetadata: {
		id?: string;
		model?: string;
		finishReason: string | null;
		usage?: unknown;
		raw: unknown;
		validationErrors?: string[];
		failureStage: "provider" | "parse" | "validation";
		attempts?: Array<{
			stage: "initial" | "repair";
			requestMessages: ChatMessage[];
			content: string | null;
			raw: unknown;
			errors: string[];
			finishReason: string | null;
		}>;
	};
};

export class AgentGenerationError extends Error {
	readonly failureArtifacts: AgentGenerationFailureArtifacts;

	constructor(message: string, failureArtifacts: AgentGenerationFailureArtifacts, options?: { cause?: unknown }) {
		super(message, options);
		this.name = "AgentGenerationError";
		this.failureArtifacts = failureArtifacts;
	}
}

export type GenerateAgentResponseInput = {
	task: AgentTaskContext;
	/** The learner's display name, as the interface shows it. */
	learnerName: string;
	history: AgentHistoryMessage[];
	event?: AgentEvent;
	userId?: string;
};

/**
 * Idle follow-ups chase the learner's silence, which is only natural in
 * point-to-point messaging. On public comment threads silence is a legitimate
 * terminal state and re-pinging a silent stranger models the exact
 * community-norm violation the simulation teaches learners to avoid, so no
 * follow-up is ever scheduled there regardless of the model's allowIdleFollowUp.
 */
export function supportsIdleFollowUp(ui: UiVariant): boolean {
	return !isThreadedUi(ui);
}

export function buildAgentResponseMessages(input: Omit<GenerateAgentResponseInput, "userId">): ChatMessage[] {
	return buildAgentMessages(input);
}

export function normalizeReplyTargets(
	decision: AgentResponseDecision,
	ui: UiVariant,
	history: AgentHistoryMessage[],
): { decision: AgentResponseDecision; warnings: string[] } {
	// Threaded replies must point at a learner comment: agent messages are the
	// model's own output and would nest its reply under itself.
	const validIds = new Set(history.flatMap((message) => (message.role === "user" ? [message.id] : [])));
	const warnings: string[] = [];
	const deliveries = decision.deliveries.map((delivery) => {
		if (delivery.replyToMessageId === null) return delivery;
		if (!isThreadedUi(ui)) {
			warnings.push(`Coerced non-null replyToMessageId ${delivery.replyToMessageId} to null for linear interface ${ui}`);
			return { ...delivery, replyToMessageId: null };
		}
		if (!validIds.has(delivery.replyToMessageId)) {
			throw new Error(`Invalid replyToMessageId: ${delivery.replyToMessageId}`);
		}
		return delivery;
	});
	return { decision: { ...decision, deliveries }, warnings };
}

function providerErrorArtifacts(messages: ChatMessage[], error: unknown): AgentGenerationFailureArtifacts {
	const details = (error as { details?: StructuredOutputErrorDetails } | null)?.details;
	const attempts = details
		? [
				{
					stage: "initial" as const,
					requestMessages: details.requestMessages,
					content: details.initialContent,
					raw: details.initialRaw,
					errors: details.errors,
					finishReason: details.finishReason,
				},
				...(details.repair
					? [
							{
								stage: "repair" as const,
								requestMessages: details.repair.requestMessages,
								content: details.repair.content,
								raw: details.repair.raw,
								errors: details.repair.errors,
								finishReason: details.repair.finishReason,
							},
						]
					: []),
			]
		: undefined;
	return {
		requestMessages: details?.repair?.requestMessages ?? details?.requestMessages ?? messages,
		rawResponse: details?.repair?.content ?? details?.initialContent ?? null,
		providerMetadata: {
			id: details?.repair?.id ?? details?.id,
			model: details?.repair?.model ?? details?.model,
			finishReason: details?.repair?.finishReason ?? details?.finishReason ?? null,
			usage: details?.repair?.usage ?? details?.usage,
			raw: details?.repair?.raw ?? details?.initialRaw ?? null,
			validationErrors: details ? [...details.errors, ...(details.repair?.errors ?? [])] : undefined,
			failureStage: details ? "parse" : "provider",
			attempts,
		},
	};
}

function validationErrorArtifacts(response: Awaited<ReturnType<typeof chatJson>>, error: unknown): AgentGenerationFailureArtifacts {
	return {
		requestMessages: response.requestMessages,
		rawResponse: response.content,
		providerMetadata: {
			id: response.id,
			model: response.model,
			finishReason: response.finishReason,
			usage: response.usage,
			raw: response.raw,
			validationErrors: [error instanceof Error ? error.message : String(error)],
			failureStage: "validation",
			attempts: [
				{
					stage: response.repair ? "repair" : "initial",
					requestMessages: response.requestMessages,
					content: response.content,
					raw: response.raw,
					errors: [error instanceof Error ? error.message : String(error)],
					finishReason: response.finishReason,
				},
			],
		},
	};
}

export async function generateAgentResponse(input: GenerateAgentResponseInput): Promise<AgentGenerationArtifacts> {
	const messages = buildAgentResponseMessages(input);
	let response: Awaited<ReturnType<typeof chatJson<typeof agentResponseDecisionSchema>>>;
	try {
		response = await chatJson({ schema: agentResponseDecisionSchema, messages, userId: input.userId });
	} catch (error) {
		const message = error instanceof Error && error.message ? error.message : "Agent generation failed";
		throw new AgentGenerationError(message, providerErrorArtifacts(messages, error), { cause: error });
	}
	let normalized: ReturnType<typeof normalizeReplyTargets>;
	try {
		normalized = normalizeReplyTargets(response.value, input.task.ui, input.history);
	} catch (error) {
		const message = error instanceof Error && error.message ? error.message : "Agent response target validation failed";
		throw new AgentGenerationError(message, validationErrorArtifacts(response, error), { cause: error });
	}
	const { decision, warnings } = normalized;

	return {
		requestMessages: response.requestMessages,
		rawResponse: response.content,
		parsedResult: decision,
		providerMetadata: {
			id: response.id,
			model: response.model,
			finishReason: response.finishReason,
			usage: response.usage,
			quota: response.quota,
			raw: response.raw,
			repair: response.repair,
			...(warnings.length > 0 ? { contractWarnings: warnings } : {}),
		},
	};
}
