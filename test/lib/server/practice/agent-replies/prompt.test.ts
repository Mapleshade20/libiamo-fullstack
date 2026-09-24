import { describe, expect, it } from "vitest";
import { type AgentTaskContext, buildAgentMessages, buildAgentPromptSections } from "$lib/server/practice/agent-replies/prompt";

const discordTask: AgentTaskContext = {
	title: "Share your mod",
	language: "es",
	ui: "discord",
	shortObjective: "Present your mod",
	description: "You finished a speedrun mod.",
	agentPrompt: "Eres Mario, un speedrunner entusiasta.",
	openingState: { serverName: "MCSR", channelName: "general-ES", previousMessages: [{ sender: "Mario", text: "Sii ya lo vi" }] },
};

const redditTask: AgentTaskContext = {
	title: "Answer a thread",
	language: "en",
	ui: "reddit",
	agentPrompt: "Play the commenters.",
	openingState: {
		post: { title: "What will happen soon?", body: "Share predictions", subreddit: "AskReddit", author: "op_user" },
		previousComments: [
			{ id: "c1", author: "alex", text: "Voice cloning scams.", replies: [{ id: "c2", author: "luma", text: "We made a family password." }] },
		],
	},
};

describe("agent prompt assembly", () => {
	it("orders the trusted system sections and ends with the response contract", () => {
		const names = buildAgentPromptSections({ task: discordTask }).map((section) => section.name);
		expect(names).toEqual([
			"ROLE",
			"CHARACTER",
			"SETTING",
			"LEARNER'S BRIEF",
			"MESSAGE STYLE",
			"TRANSCRIPT FORMAT",
			"CURRENT EVENT",
			"RESPONSE CONTRACT",
		]);
	});

	it("keeps the author's character text and the setting in the system message, and the conversation in the user message", () => {
		const [system, user] = buildAgentMessages({
			task: discordTask,
			learnerName: "Maple",
			history: [{ id: 5, role: "user", content: "Hola, hice un mod" }],
		});

		expect(system.role).toBe("system");
		expect(system.content).toContain(discordTask.agentPrompt);
		expect(system.content).toContain("general-ES");
		expect(system.content).not.toContain("Hola, hice un mod");
		// Opening messages belong to the transcript, not the system message.
		expect(system.content).not.toContain("Sii ya lo vi");

		const payload = JSON.parse(user.content);
		expect(payload.learner).toEqual({ name: "Maple" });
		expect(payload.transcript).toEqual([
			{ opening: true, role: "counterpart", author: "Mario", text: "Sii ya lo vi" },
			{ role: "learner", author: "Maple", text: "Hola, hice un mod" },
		]);
	});

	it("never gives the counterpart the graded objectives", () => {
		const system = buildAgentMessages({
			task: { ...discordTask, objectives: ["Pide feedback"] } as AgentTaskContext,
			learnerName: "Maple",
			history: [],
		})[0];
		expect(system.content).not.toContain("Pide feedback");
	});

	it("describes an idle follow-up only in follow-up events", () => {
		const event = (input: Parameters<typeof buildAgentPromptSections>[0]) =>
			buildAgentPromptSections(input).find((section) => section.name === "CURRENT EVENT")?.body;
		const reply = event({ task: discordTask });
		const firstNudge = event({ task: discordTask, event: { kind: "follow_up", followUpCount: 1 } });
		const finalNudge = event({ task: discordTask, event: { kind: "follow_up", followUpCount: 2 } });
		expect(new Set([reply, firstNudge, finalNudge]).size).toBe(3);
	});

	it("sends learner text rather than legacy prompt wrappers persisted beside it", () => {
		const [, user] = buildAgentMessages({
			task: discordTask,
			learnerName: "Maple",
			history: [{ id: 5, role: "user", content: "Reply as Mario with only the comment text...", llmMetadata: { displayContent: "¿Qué tal?" } }],
		});
		expect(JSON.parse(user.content).transcript.at(-1).text).toBe("¿Qué tal?");
		expect(user.content).not.toContain("Reply as Mario");
	});

	it("threads comments by id and names who answers each learner comment", () => {
		const [system, user] = buildAgentMessages({
			task: redditTask,
			learnerName: "Maple",
			history: [
				{
					id: 10,
					role: "user",
					content: "Same here!",
					llmMetadata: { clientMessageId: "a", thread: { commentId: "reddit-user-a", targetCommentId: "c2", responderName: "luma" } },
				},
				{
					id: 11,
					role: "assistant",
					content: "Glad it helps.",
					llmMetadata: { assistantAuthorName: "luma", thread: { parentCommentId: "reddit-user-a", responderName: "luma" } },
				},
				{
					id: 12,
					role: "user",
					content: "It does.",
					llmMetadata: { clientMessageId: "b", thread: { commentId: "reddit-user-b", targetCommentId: "reddit-agent-11", responderName: "luma" } },
				},
			],
		});

		expect(system.content).toContain("What will happen soon?");
		expect(JSON.parse(user.content).transcript).toEqual([
			{ commentId: "c1", replyTo: null, opening: true, role: "other", author: "alex", text: "Voice cloning scams." },
			{ commentId: "c2", replyTo: "c1", opening: true, role: "other", author: "luma", text: "We made a family password." },
			{ messageId: 10, commentId: "reddit-user-a", replyTo: "c2", role: "learner", author: "Maple", text: "Same here!", respondAs: "luma" },
			{ commentId: "reddit-agent-11", replyTo: "reddit-user-a", role: "counterpart", author: "luma", text: "Glad it helps." },
			{
				messageId: 12,
				commentId: "reddit-user-b",
				replyTo: "reddit-agent-11",
				role: "learner",
				author: "Maple",
				text: "It does.",
				respondAs: "luma",
			},
		]);
	});

	it("renders learner emails from their headers and layout, without persisted instructions", () => {
		const [, user] = buildAgentMessages({
			task: { ...discordTask, ui: "apple_mail", openingState: { emails: [] } },
			learnerName: "Maple",
			history: [
				{
					id: 3,
					role: "user",
					content: "To: Shane\nSubject: Booking\n\nHello Shane",
					llmMetadata: { mailBodyHtml: "<ul><li>Saturday</li><li>Two people</li></ul>" },
				},
			],
		});
		expect(JSON.parse(user.content).transcript).toEqual([
			{ role: "learner", author: "Maple", to: "Shane", subject: "Booking", text: "- Saturday\n- Two people" },
		]);
	});
});
