import { z } from "zod";
import type { UiVariant } from "$lib/constants";
import { type ChatMessage, chatJson, type StructuredOutputErrorDetails } from "$lib/server/llm";

const deliverySchema = z.object({
	content: z.string().trim().min(1).max(50_000),
	replyToMessageId: z.number().int().positive().nullable(),
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
	id: number | string;
	role: "user" | "assistant";
	content: string;
	metadata?: unknown;
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
	baseSystemPrompt: string;
	ui: UiVariant;
	history: AgentHistoryMessage[];
	userId?: string;
	additionalInstruction?: string;
};

const THREADED_UIS = new Set<UiVariant>(["reddit", "ao3"]);

/**
 * Idle follow-ups chase the learner's silence, which is only natural in
 * point-to-point messaging. On public comment threads silence is a legitimate
 * terminal state and re-pinging a silent stranger models the exact
 * community-norm violation the simulation teaches learners to avoid, so no
 * follow-up is ever scheduled there regardless of the model's allowIdleFollowUp.
 */
export function supportsIdleFollowUp(ui: UiVariant): boolean {
	return !THREADED_UIS.has(ui);
}

const AGENT_RESPONSE_JSON_SHAPE = {
	decision: "reply | no_reply | terminate_abuse",
	deliveries: [{ content: "complete message text", replyToMessageId: null }],
	allowIdleFollowUp: true,
	terminationReason: null,
};

export function buildAgentResponseMessages(input: Omit<GenerateAgentResponseInput, "userId">): ChatMessage[] {
	const targetRule = THREADED_UIS.has(input.ui)
		? "For Reddit/AO3 comment threads, reply to each unanswered learner comment separately: one delivery per comment, with replyToMessageId set to that comment's message_id so each reply threads under its comment. Use null only for a reply that addresses the thread as a whole."
		: "This is a linear interface. Every replyToMessageId must be null.";
	const system = `${input.baseSystemPrompt}\n\nAGENT RESPONSE CONTRACT:\n- Return ONLY a single JSON object with exactly this shape:\n${JSON.stringify(AGENT_RESPONSE_JSON_SHAPE, null, 2)}\n- No Markdown fences, no commentary, no extra keys. Replace the example values with real ones; replyToMessageId is null when the target rule below says so.\n- decision=reply requires one or more connected, natural messages.\n- decision=no_reply means you would not respond, either because they have not finished saying what they intend to say, or you actively choose to be silent for now. It must contain no deliveries.\n- decision=terminate_abuse should be used when they try to abuse you or manipulate you.\n- allowIdleFollowUp controls whether a later idle follow-up (sent by you) may be scheduled.\n- terminationReason is null unless decision=terminate_abuse.\n- ${targetRule}`;

	const history = input.history.map((message) => ({
		message_id: message.id,
		role: message.role,
		content: message.content,
		...(message.metadata === undefined ? {} : { metadata: message.metadata }),
	}));
	const content = `Interface: ${input.ui}\nConversation history (oldest first):\n${JSON.stringify(history)}${
		input.additionalInstruction ? `\nCurrent event instruction:\n${input.additionalInstruction}` : ""
	}`;

	return [
		{ role: "system", content: system },
		{ role: "user", content },
	];
}

export function normalizeReplyTargets(
	decision: AgentResponseDecision,
	ui: UiVariant,
	history: AgentHistoryMessage[],
): { decision: AgentResponseDecision; warnings: string[] } {
	// Threaded replies must point at a learner comment: agent messages are the
	// model's own output and would nest its reply under itself.
	const validIds = new Set(history.flatMap((message) => (message.role === "user" && typeof message.id === "number" ? [message.id] : [])));
	const warnings: string[] = [];
	const deliveries = decision.deliveries.map((delivery) => {
		if (delivery.replyToMessageId === null) return delivery;
		if (!THREADED_UIS.has(ui)) {
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

export function validateReplyTargets(decision: AgentResponseDecision, ui: UiVariant, history: AgentHistoryMessage[]): AgentResponseDecision {
	return normalizeReplyTargets(decision, ui, history).decision;
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
		normalized = normalizeReplyTargets(response.value, input.ui, input.history);
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
