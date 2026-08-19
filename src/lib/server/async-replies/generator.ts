import { z } from "zod";
import type { UiVariant } from "$lib/constants";
import { type ChatMessage, chatJson } from "$lib/server/llm";

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
	};
};

export type GenerateAgentResponseInput = {
	baseSystemPrompt: string;
	ui: UiVariant;
	history: AgentHistoryMessage[];
	userId: string;
	additionalInstruction?: string;
};

const THREADED_UIS = new Set<UiVariant>(["reddit", "ao3"]);

export function buildAgentResponseMessages(input: Omit<GenerateAgentResponseInput, "userId">): ChatMessage[] {
	const targetRule = THREADED_UIS.has(input.ui)
		? "For Reddit/AO3, replyToMessageId may reference a message_id from the supplied history when threading matters. Otherwise use null."
		: "This is a linear interface. Every replyToMessageId must be null.";
	const system = `${input.baseSystemPrompt}\n\nASYNC RESPONSE CONTRACT:\n- Return JSON matching the supplied schema.\n- decision=reply requires one or more complete, natural messages. Never emit sentence fragments, drafts, narration, sender labels, or mechanical punctuation splits.\n- decision=no_reply means a real person would reasonably send nothing now. It must contain no deliveries.\n- decision=terminate_abuse is reserved only for severe insults or attacks. Ordinary disagreement, thanks, farewells, or a conversation that feels complete are never abuse termination.\n- allowIdleFollowUp only controls whether a later idle follow-up may be scheduled. Setting it false never completes the session.\n- terminationReason is null unless decision=terminate_abuse.\n- ${targetRule}`;

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

export function validateReplyTargets(decision: AgentResponseDecision, ui: UiVariant, history: AgentHistoryMessage[]): AgentResponseDecision {
	const validIds = new Set(history.flatMap((message) => (typeof message.id === "number" ? [message.id] : [])));
	for (const delivery of decision.deliveries) {
		if (!THREADED_UIS.has(ui) && delivery.replyToMessageId !== null) {
			throw new Error(`replyToMessageId is not allowed for ${ui}`);
		}
		if (delivery.replyToMessageId !== null && !validIds.has(delivery.replyToMessageId)) {
			throw new Error(`Invalid replyToMessageId: ${delivery.replyToMessageId}`);
		}
	}
	return decision;
}

export async function generateAgentResponse(input: GenerateAgentResponseInput): Promise<AgentGenerationArtifacts> {
	const messages = buildAgentResponseMessages(input);
	const response = await chatJson({ schema: agentResponseDecisionSchema, messages, userId: input.userId });
	const parsedResult = validateReplyTargets(response.value, input.ui, input.history);

	return {
		requestMessages: response.requestMessages,
		rawResponse: response.content,
		parsedResult,
		providerMetadata: {
			id: response.id,
			model: response.model,
			finishReason: response.finishReason,
			usage: response.usage,
			quota: response.quota,
			raw: response.raw,
			repair: response.repair,
		},
	};
}
