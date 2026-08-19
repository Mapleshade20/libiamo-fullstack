import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockChatJson } = vi.hoisted(() => ({ mockChatJson: vi.fn() }));
vi.mock("$lib/server/llm", () => ({ chatJson: mockChatJson }));

import {
	agentResponseDecisionSchema,
	buildAgentResponseMessages,
	generateAgentResponse,
	validateReplyTargets,
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

	it("rejects illegal thread targets and targets on linear interfaces", () => {
		expect(() => validateReplyTargets({ ...reply, deliveries: [{ ...reply.deliveries[0], replyToMessageId: 7 }] }, "imessage", [])).toThrow(
			"not allowed",
		);
		expect(() =>
			validateReplyTargets({ ...reply, deliveries: [{ ...reply.deliveries[0], replyToMessageId: 99 }] }, "reddit", [
				{ id: 7, role: "user", content: "Parent" },
			]),
		).toThrow("Invalid replyToMessageId");
		expect(
			validateReplyTargets({ ...reply, deliveries: [{ ...reply.deliveries[0], replyToMessageId: 7 }] }, "ao3", [
				{ id: 7, role: "user", content: "Parent" },
			]),
		).toMatchObject({ deliveries: [{ replyToMessageId: 7 }] });
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
});
