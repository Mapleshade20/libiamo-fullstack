import { describe, expect, it } from "vitest";
import { resolveScene } from "$lib/practice/scene";
import { type AgentTaskContext, buildAgentMessages, buildAgentPromptSections } from "$lib/server/practice/agent-replies/prompt";

const discordOpening = { serverName: "MCSR", channelName: "general-ES", previousMessages: [{ sender: "Mario", text: "Sii ya lo vi" }] };

const discordTask: AgentTaskContext = {
	title: "Share your mod",
	language: "es",
	ui: "discord",
	shortObjective: "Present your mod",
	description: "You finished a speedrun mod.",
	agentPrompt: "Eres Mario, un speedrunner entusiasta.",
	openingState: discordOpening,
	scene: resolveScene("discord", discordOpening, 1, "Maple"),
};

const dmTask: AgentTaskContext = {
	...discordTask,
	openingState: { dm: true, counterpartName: "Mario" },
	scene: resolveScene("discord", { dm: true, counterpartName: "Mario" }, 1, "Maple"),
};

const sectionNames = (task: AgentTaskContext) => buildAgentPromptSections({ task }).map((section) => section.name);

describe("scene prompt assembly", () => {
	it("orders the trusted sections, adding group dynamics only where others can speak", () => {
		const oneToOne = [
			"ROLE",
			"CHARACTER NOTES",
			"CAST",
			"SETTING",
			"LEARNER'S BRIEF",
			"HOW PEOPLE WRITE HERE",
			"TRANSCRIPT FORMAT",
			"CURRENT EVENT",
			"RESPONSE CONTRACT",
		];
		expect(sectionNames(dmTask)).toEqual(oneToOne);
		expect(sectionNames(discordTask)).toEqual([...oneToOne.slice(0, 6), "GROUP DYNAMICS", ...oneToOne.slice(6)]);
		// A task cut from a real conversation gives the cast how it really went on, after the setting.
		expect(sectionNames({ ...dmTask, source: { continuation: "Mario: see you at 8" } })).toEqual([
			...oneToOne.slice(0, 4),
			"THE REAL CONVERSATION",
			...oneToOne.slice(4),
		]);
	});

	it("keeps the author's notes and the setting in the system message, and the conversation in the user message", () => {
		const [system, user] = buildAgentMessages({
			task: discordTask,
			learnerName: "Maple",
			history: [{ id: 5, role: "user", content: "Hola, hice un mod" }],
		});

		expect(system.content).toContain(discordTask.agentPrompt);
		expect(system.content).toContain("general-ES");
		expect(system.content).not.toContain("Hola, hice un mod");
		// Opening messages belong to the transcript, not the system message.
		expect(system.content).not.toContain("Sii ya lo vi");

		const payload = JSON.parse(user.content);
		expect(payload.learner).toEqual({ name: "Maple" });
		expect(payload.transcript).toEqual([
			{ id: 1, opening: true, role: "cast", author: "Mario", text: "Sii ya lo vi" },
			{ id: 2, role: "learner", author: "Maple", text: "Hola, hice un mod" },
		]);
		expect(payload.nextId).toBe(3);
	});

	it("never gives the cast the graded objectives", () => {
		const [system] = buildAgentMessages({
			task: { ...discordTask, objectives: ["Pide feedback"] } as AgentTaskContext,
			learnerName: "Maple",
			history: [],
		});
		expect(system.content).not.toContain("Pide feedback");
	});

	it("tells a quiet spell apart: a reply, a one-to-one nudge, and time passing in a group", () => {
		const event = (task: AgentTaskContext, followUpCount?: number) =>
			buildAgentPromptSections({ task, event: followUpCount ? { kind: "follow_up", followUpCount } : { kind: "reply" } }).find(
				(section) => section.name === "CURRENT EVENT",
			)?.body;
		expect(new Set([event(dmTask), event(dmTask, 1), event(dmTask, 2), event(discordTask, 1)]).size).toBe(4);
	});

	it("draws the floor for group scenes only, the same way for the same seed", () => {
		const moment = (task: AgentTaskContext, seed: number) =>
			JSON.parse(buildAgentMessages({ task, learnerName: "Maple", history: [{ id: 5, role: "user", content: "hola" }], seed })[1].content).moment;
		expect(moment(discordTask, 7)).toEqual(moment(discordTask, 7));
		for (const seed of [1, 2, 3])
			expect(moment(discordTask, seed).around.some((person: { does: string }) => person.does.startsWith("answers #"))).toBe(true);
		expect(moment(dmTask, 7)).toBeUndefined();
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

	it("renders learner emails from their headers and plain body", () => {
		const [, user] = buildAgentMessages({
			task: { ...discordTask, ui: "apple_mail", openingState: { emails: [] }, scene: resolveScene("apple_mail", { emails: [] }, 1, "Maple") },
			learnerName: "Maple",
			history: [{ id: 3, role: "user", content: "To: Shane\nSubject: Booking\n\nHello Shane" }],
		});
		expect(JSON.parse(user.content).transcript).toEqual([
			{ id: 1, role: "learner", author: "Maple", to: "Shane", subject: "Booking", text: "Hello Shane" },
		]);
	});
});
