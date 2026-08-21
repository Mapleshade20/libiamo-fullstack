import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockChatJson } = vi.hoisted(() => ({ mockChatJson: vi.fn() }));
vi.mock("$lib/server/llm", () => ({ chatJson: mockChatJson }));

import type { AgentHistoryMessage } from "$lib/server/async-replies/generator";
import {
	AgentGenerationError,
	agentResponseDecisionSchema,
	buildAgentResponseMessages,
	generateAgentResponse,
	normalizeReplyTargets,
} from "$lib/server/async-replies/generator";

const reply = {
	decision: "reply" as const,
	deliveries: [{ content: "Sounds good.", replyToMessageId: null }],
	allowIdleFollowUp: true,
	terminationReason: null,
};

describe("structured agent response", () => {
	beforeEach(() => vi.resetAllMocks());

	it("enforces reply, no-reply, and abuse-only termination invariants", () => {
		expect(agentResponseDecisionSchema.safeParse(reply).success).toBe(true);
		expect(agentResponseDecisionSchema.safeParse({ ...reply, decision: "reply", deliveries: [] }).success).toBe(false);
		expect(agentResponseDecisionSchema.safeParse({ ...reply, decision: "no_reply", deliveries: reply.deliveries }).success).toBe(false);
		expect(
			agentResponseDecisionSchema.safeParse({
				...reply,
				decision: "terminate_abuse",
				deliveries: [],
				terminationReason: "Severe personal attack",
			}).success,
		).toBe(true);
		expect(agentResponseDecisionSchema.safeParse({ ...reply, terminationReason: "ordinary goodbye" }).success).toBe(false);
	});

	it("makes ordinary farewells non-terminating and idle-follow-up semantics explicit in the prompt", () => {
		const messages = buildAgentResponseMessages({
			baseSystemPrompt: "Speak Spanish.",
			ui: "imessage",
			history: [{ id: 7, role: "user", content: "Gracias, adiós." }],
		});

		expect(messages.map((message) => message.role)).toEqual(["system", "user"]);
		expect(messages[0].content).toContain("farewells");
		expect(messages[0].content).toContain("Setting it false never completes the session");
		expect(messages[1].content).toContain('"message_id":7');
		expect(messages[1].content).toContain("Gracias, adiós.");
	});

	it("coerces linear-interface targets to null and rejects unknown threaded targets", () => {
		expect(normalizeReplyTargets({ ...reply, deliveries: [{ ...reply.deliveries[0], replyToMessageId: 7 }] }, "imessage", [])).toMatchObject({
			decision: { deliveries: [{ replyToMessageId: null }] },
			warnings: [expect.stringContaining("replyToMessageId 7")],
		});
		expect(() =>
			normalizeReplyTargets({ ...reply, deliveries: [{ ...reply.deliveries[0], replyToMessageId: 99 }] }, "reddit", [
				{ id: 7, role: "user", content: "Parent" },
			]),
		).toThrow("Invalid replyToMessageId");
		expect(
			normalizeReplyTargets({ ...reply, deliveries: [{ ...reply.deliveries[0], replyToMessageId: 7 }] }, "ao3", [
				{ id: 7, role: "user", content: "Parent" },
			]),
		).toMatchObject({ decision: { deliveries: [{ replyToMessageId: 7 }] }, warnings: [] });
	});

	it("rejects threaded targets pointing at the agent's own messages", () => {
		const history: AgentHistoryMessage[] = [
			{ id: 7, role: "user", content: "Learner comment" },
			{ id: 8, role: "assistant", content: "Author reply" },
		];
		// pointing at the assistant message must not validate: the reply would nest under itself
		expect(() => normalizeReplyTargets({ ...reply, deliveries: [{ ...reply.deliveries[0], replyToMessageId: 8 }] }, "ao3", history)).toThrow(
			"Invalid replyToMessageId",
		);
		expect(normalizeReplyTargets({ ...reply, deliveries: [{ ...reply.deliveries[0], replyToMessageId: 7 }] }, "ao3", history)).toMatchObject({
			decision: { deliveries: [{ replyToMessageId: 7 }] },
			warnings: [],
		});
	});

	it("returns exact prompts, raw response, parsed result, metadata, and repair artifacts", async () => {
		mockChatJson.mockResolvedValue({
			value: reply,
			content: JSON.stringify(reply),
			requestMessages: [
				{ role: "system", content: "exact" },
				{ role: "user", content: "history" },
			],
			id: "completion-1",
			model: "test-model",
			finishReason: "stop",
			usage: { totalTokens: 42 },
			quota: { tokensLeft: 100 },
			raw: { id: "raw-1" },
			repair: { initialContent: "bad", initialRaw: { id: "raw-0" }, errors: ["invalid JSON"] },
		});

		const result = await generateAgentResponse({
			baseSystemPrompt: "Context",
			ui: "discord",
			history: [{ id: 1, role: "user", content: "Hi" }],
			userId: "user-1",
		});

		expect(mockChatJson).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-1", schema: agentResponseDecisionSchema }));
		expect(result.requestMessages[0].content).toBe("exact");
		expect(result.rawResponse).toBe(JSON.stringify(reply));
		expect(result.parsedResult).toEqual(reply);
		expect(result.providerMetadata).toMatchObject({
			id: "completion-1",
			model: "test-model",
			finishReason: "stop",
			repair: { initialContent: "bad" },
		});
	});

	it("inlines the exact JSON response shape into the system prompt", () => {
		const [system] = buildAgentResponseMessages({ baseSystemPrompt: "Context", ui: "discord", history: [] });
		expect(system.role).toBe("system");
		expect(system.content).toContain('"decision":"reply | no_reply | terminate_abuse"');
		expect(system.content).toContain('"deliveries":[{"content":"complete message text","replyToMessageId":null}]');
		expect(system.content).toContain('"allowIdleFollowUp":true');
		expect(system.content).toContain('"terminationReason":null');
	});

	it("wraps provider failures with request evidence for later inspection", async () => {
		const providerError = Object.assign(new Error("provider exploded"), {
			details: {
				requestMessages: [
					{ role: "system", content: "exact failed prompt" },
					{ role: "user", content: "history" },
				],
				initialContent: "not json",
				initialRaw: { id: "raw-x" },
				errors: ["Invalid JSON: boom"],
				finishReason: "stop",
				usage: { totalTokens: 7 },
				id: "completion-x",
				model: "test-model",
			},
		});
		mockChatJson.mockRejectedValue(providerError);

		const failure = await generateAgentResponse({
			baseSystemPrompt: "Context",
			ui: "discord",
			history: [{ id: 1, role: "user", content: "Hi" }],
		}).catch((error) => error);

		expect(failure).toBeInstanceOf(AgentGenerationError);
		expect(failure.failureArtifacts.rawResponse).toBe("not json");
		expect(failure.failureArtifacts.requestMessages).toHaveLength(2);
		expect(failure.failureArtifacts.providerMetadata).toMatchObject({
			id: "completion-x",
			finishReason: "stop",
			failureStage: "parse",
			validationErrors: ["Invalid JSON: boom"],
		});
	});

	it("keeps the successful provider response when threaded target validation fails", async () => {
		mockChatJson.mockResolvedValue({
			value: { ...reply, deliveries: [{ content: "Reply", replyToMessageId: 999 }] },
			content: '{"decision":"reply","deliveries":[{"content":"Reply","replyToMessageId":999}]}',
			requestMessages: [{ role: "system", content: "exact target prompt" }],
			id: "completion-target",
			model: "test-model",
			finishReason: "stop",
			usage: { totalTokens: 12 },
			raw: { id: "raw-target" },
			repair: null,
		});

		const failure = await generateAgentResponse({
			baseSystemPrompt: "Context",
			ui: "reddit",
			history: [{ id: 7, role: "user", content: "Parent" }],
		}).catch((error) => error);

		expect(failure).toBeInstanceOf(AgentGenerationError);
		expect(failure.failureArtifacts).toMatchObject({
			requestMessages: [{ role: "system", content: "exact target prompt" }],
			rawResponse: expect.stringContaining('"replyToMessageId":999'),
			providerMetadata: {
				id: "completion-target",
				failureStage: "validation",
				validationErrors: ["Invalid replyToMessageId: 999"],
			},
		});
	});

	it("attributes failures without details to the provider stage", async () => {
		mockChatJson.mockRejectedValue(new Error("network down"));

		const failure = await generateAgentResponse({
			baseSystemPrompt: "Context",
			ui: "discord",
			history: [],
		}).catch((error) => error);

		expect(failure.failureArtifacts.providerMetadata.failureStage).toBe("provider");
		expect(failure.failureArtifacts.rawResponse).toBeNull();
	});
});
