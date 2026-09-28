import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockChatJson } = vi.hoisted(() => ({ mockChatJson: vi.fn() }));
vi.mock("$lib/server/llm/client", () => ({ chatJson: mockChatJson }));

import { formatMailAddress, seededContact } from "$lib/practice/mail";
import {
	AgentGenerationError,
	type AgentHistoryMessage,
	type AgentReplyRecipeInput,
	agentResponseDecisionSchema,
	agentTaskContext,
	buildAgentResponseMessages,
	generateAgentResponse,
	resolveSceneTurn,
} from "$lib/server/practice/agent-replies/generator";

const task: Parameters<typeof agentTaskContext>[0] = {
	id: 1,
	title: "Plan a trip",
	language: "es",
	ui: "imessage",
	agentPrompt: "Eres Lucía.",
	openingState: { previousMessages: [{ sender: "Lucía", text: "¿Vamos?" }] },
};

const reply = {
	decision: "reply" as const,
	deliveries: [{ author: "Lucía", replyTo: null, content: "Sounds good." }],
	allowIdleFollowUp: true,
	terminationReason: null,
};

function turnInput(overrides: Partial<typeof task>, history: AgentHistoryMessage[] = []): AgentReplyRecipeInput {
	return { task: agentTaskContext({ ...task, ...overrides }, "Maple"), learnerName: "Maple", history };
}

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

	it("tolerates a dropped or stringified reply target instead of spending a repair", () => {
		const parsed = agentResponseDecisionSchema.parse({
			...reply,
			deliveries: [{ content: "Sin destino" }, { author: "Lucía", content: "Con destino", replyTo: "12" }],
		});
		expect(parsed.deliveries.map((delivery) => delivery.replyTo)).toEqual([null, 12]);
		expect(agentResponseDecisionSchema.safeParse({ ...reply, deliveries: [{ content: "x", replyTo: "c-12" }] }).success).toBe(false);
	});

	it("builds a system message and a transcript user message from the live task", () => {
		const messages = buildAgentResponseMessages({ ...turnInput({}), history: [{ id: 7, role: "user", content: "Gracias, adiós." }] });

		expect(messages.map((message) => message.role)).toEqual(["system", "user"]);
		const payload = JSON.parse(messages[1].content);
		expect(payload.transcript.at(-1)).toMatchObject({ id: 2, role: "learner", author: "Maple", text: "Gracias, adiós." });
		expect(payload.nextId).toBe(3);
	});

	it("names the counterpart as the surface shows it when the task authored no name", async () => {
		mockChatJson.mockResolvedValue({ value: reply, content: JSON.stringify(reply), requestMessages: [], finishReason: "stop", raw: {} });
		const history: AgentHistoryMessage[] = [
			{ id: 1, role: "user", content: "To: x\nSubject: Charter\n\nHi" },
			{ id: 2, role: "assistant", content: "Hello" },
		];

		const result = await generateAgentResponse({
			task: { ...task, ui: "apple_mail" as const, openingState: { emails: [] } },
			learnerName: "Maple",
			history,
		});

		const [system, user] = mockChatJson.mock.calls[0][0].messages;
		const contact = seededContact(task.id);
		expect(system.content).toContain(formatMailAddress(contact));
		expect(JSON.parse(user.content).transcript.at(-1)).toMatchObject({ role: "cast", author: contact.name });
		// one-to-one, every message is the counterpart's, whatever name the model used
		expect(result.parsedResult.deliveries[0].author).toBe(contact.name);
	});
});

describe("resolving a turn against the transcript", () => {
	const reddit = {
		ui: "reddit" as const,
		openingState: { post: { author: "op" }, previousComments: [{ id: "c1", author: "alex", text: "Voice scams." }] },
	};
	const learnerComment: AgentHistoryMessage = {
		id: 10,
		role: "user",
		content: "Same",
		llmMetadata: { clientMessageId: "m1", thread: { commentId: "reddit-user-m1", targetCommentId: "c1" } },
	};

	it("turns transcript ids into stored refs and earlier deliveries of the turn into @n", () => {
		const turn = resolveSceneTurn(
			{
				...reply,
				deliveries: [
					{ author: "alex", replyTo: 2, content: "nah" },
					{ author: "luma", replyTo: 3, content: "lol" },
					{ author: "zed", replyTo: null, content: "new thought" },
				],
			},
			turnInput(reddit, [learnerComment]),
		);
		expect(turn.deliveries.map(({ author, replyTo }) => [author, replyTo])).toEqual([
			["alex", "reddit-user-m1"],
			["luma", "@0"],
			["zed", null],
		]);
		expect(turn.warnings).toEqual([]);
	});

	it("keeps a public channel alive even when the model thinks the talk has wound down", () => {
		const quiet = { ...reply, allowIdleFollowUp: false, deliveries: [] };
		const channel = { ui: "discord" as const, openingState: { previousMessages: [{ sender: "zote", text: "a" }] } };
		const friends = { ui: "imessage" as const, openingState: { members: "Tom, Jess", previousMessages: [{ sender: "Priya", text: "a" }] } };
		expect(resolveSceneTurn(quiet, turnInput(channel, [])).allowIdleFollowUp).toBe(true);
		expect(resolveSceneTurn(quiet, turnInput(friends, [])).allowIdleFollowUp).toBe(false);
	});

	it("never lets anyone answer themselves or speak as the learner", () => {
		const turn = resolveSceneTurn(
			{
				...reply,
				deliveries: [
					{ author: "alex", replyTo: 1, content: "adding to my own comment" },
					{ author: "Maple", replyTo: 2, content: "impersonation" },
				],
			},
			turnInput(reddit, [learnerComment]),
		);
		expect(turn.deliveries.map(({ author, replyTo }) => [author, replyTo])).toEqual([
			// continues under the learner's answer to alex's comment
			["alex", "reddit-user-m1"],
			["op", "reddit-user-m1"],
		]);
		expect(turn.warnings).toHaveLength(2);
	});

	it("sends a reply aimed at someone's own comment to the latest answer another person gave it", () => {
		const answered: AgentHistoryMessage = {
			id: 11,
			role: "assistant",
			content: "nah",
			llmMetadata: { assistantAuthorName: "zed", thread: { parentCommentId: "c1" } },
		};
		const turn = resolveSceneTurn({ ...reply, deliveries: [{ author: "alex", replyTo: 1, content: "no u" }] }, turnInput(reddit, [answered]));
		expect(turn.deliveries[0].replyTo).toBe("reddit-agent-11");
	});

	it("splits the messages of people who send bursts, keeping @n on the first piece", () => {
		const opening = {
			previousMessages: [
				{ sender: "zote", text: "a" },
				{ sender: "zote", text: "b" },
			],
		};
		const input = turnInput({ ui: "discord", openingState: opening });
		const turn = resolveSceneTurn(
			{
				...reply,
				deliveries: [
					{ author: "zote", replyTo: null, content: "no way. that patch broke it. again" },
					{ author: "kiwi", replyTo: null, content: "pins" },
					{ author: "grub", replyTo: 3, content: "lol" },
				],
			},
			input,
		);
		expect(turn.deliveries.map(({ author, content, replyTo }) => [author, content, replyTo])).toEqual([
			["zote", "no way.", null],
			["zote", "that patch broke it.", null],
			["zote", "again", null],
			["kiwi", "pins", null],
			["grub", "lol", "@0"],
		]);
	});

	it("keeps chat quotes only on Discord and only for messages that scrolled away", () => {
		const history: AgentHistoryMessage[] = [{ id: 5, role: "user", content: "hola" }];
		const discord = resolveSceneTurn(
			{
				...reply,
				deliveries: [
					{ author: "Nova", replyTo: 1, content: "old one" },
					{ author: "Zephyr", replyTo: 3, content: "the one right above" },
				],
			},
			turnInput({ ui: "discord" }, history),
		);
		expect(discord.deliveries.map((delivery) => delivery.replyTo)).toEqual(["opening-0", null]);
		const imessage = resolveSceneTurn({ ...reply, deliveries: [{ author: "Lucía", replyTo: 1, content: "x" }] }, turnInput({}, history));
		expect(imessage.deliveries[0].replyTo).toBeNull();
	});
});

describe("generation artifacts", () => {
	beforeEach(() => vi.resetAllMocks());

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
			task: { ...task, ui: "discord" as const },
			learnerName: "Maple",
			history: [{ id: 1, role: "user", content: "Hi" }],
			userId: "user-1",
		});

		expect(mockChatJson).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-1", schema: agentResponseDecisionSchema }));
		expect(result.requestMessages[0].content).toBe("exact");
		expect(result.rawResponse).toBe(JSON.stringify(reply));
		expect(result.parsedResult).toEqual({ ...reply, warnings: [] });
		expect(result.providerMetadata).toMatchObject({
			id: "completion-1",
			model: "test-model",
			finishReason: "stop",
			repair: { initialContent: "bad" },
		});
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
			task: { ...task, ui: "discord" as const },
			learnerName: "Maple",
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

	it("attributes failures without details to the provider stage", async () => {
		mockChatJson.mockRejectedValue(new Error("network down"));

		const failure = await generateAgentResponse({
			task: { ...task, ui: "discord" as const },
			learnerName: "Maple",
			history: [],
		}).catch((error) => error);

		expect(failure.failureArtifacts.providerMetadata.failureStage).toBe("provider");
		expect(failure.failureArtifacts.rawResponse).toBeNull();
	});
});
