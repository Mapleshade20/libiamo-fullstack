import { describe, expect, it } from "vitest";
import { buildChatTranscript, describeLevel, renderScenarioSetting, renderTaskBrief } from "$lib/server/practice/prompt-context";

const task = {
	title: "Weekend plans",
	language: "en",
	ui: "imessage" as const,
	difficulty: 2,
	shortObjective: "Agree on a plan",
	description: "Your friend Alex asks about the weekend.",
	objectives: ["Suggest an activity", "Confirm a time"],
	materialsMd: "## Phrases\n- Sounds good",
};

describe("task brief", () => {
	it("includes objectives and materials only when asked", () => {
		const counterpart = renderTaskBrief(task);
		expect(counterpart).toContain("Your friend Alex asks about the weekend.");
		expect(counterpart).not.toContain("Suggest an activity");
		expect(counterpart).not.toContain("Sounds good");

		const tutor = renderTaskBrief(task, { objectives: true, materials: true });
		expect(tutor).toContain("1. Suggest an activity\n2. Confirm a time");
		// Materials keep their Markdown inside their own delimited block.
		expect(tutor).toMatch(/<materials>\n## Phrases[\s\S]*<\/materials>$/);
	});

	it("names levels and ignores unknown ones", () => {
		expect(describeLevel(3)).toBe("advanced (3 of 3)");
		expect(describeLevel(null)).toBeNull();
		expect(describeLevel(7)).toBeNull();
	});
});

describe("scenario setting", () => {
	it("describes the surface without repeating opening messages", () => {
		const setting = renderScenarioSetting("reddit", {
			post: { title: "Predictions?", body: "Go", subreddit: "AskReddit", author: "op" },
			previousComments: [{ author: "alex", text: "Voice scams." }],
		});
		expect(setting).toContain("r/AskReddit");
		expect(setting).toContain("Predictions?");
		expect(setting).not.toContain("Voice scams.");
	});
});

describe("chat transcript", () => {
	it("puts opening messages before the session and labels roles relative to the learner", () => {
		const transcript = buildChatTranscript({
			ui: "discord",
			openingState: {
				previousMessages: [
					{ sender: "Mario", text: "hola" },
					{ sender: "Lucía", text: "¿mods nuevos?" },
					{ sender: "Maple", text: "yo" },
				],
			},
			learnerName: "Maple",
			messages: [
				{ id: 1, role: "user", content: "hice uno" },
				{ id: 2, role: "assistant", content: "¡genial!" },
				{ id: 3, role: "user", content: "oculto", llmMetadata: { hidden: true } },
				{ id: 4, role: "system", content: "internal" },
			],
		});
		expect(transcript.map(({ role, author, text }) => [role, author, text])).toEqual([
			["counterpart", "Mario", "hola"],
			["other", "Lucía", "¿mods nuevos?"],
			["learner", "Maple", "yo"],
			["learner", "Maple", "hice uno"],
			["counterpart", "Mario", "¡genial!"],
		]);
	});

	it("keeps opening email headers", () => {
		const [email] = buildChatTranscript({
			ui: "apple_mail",
			openingState: { emails: [{ from: "M. Durand", to: "Vous", subject: "Compteurs", body: "Bonjour", time: "lundi" }] },
			learnerName: "Maple",
			messages: [],
		});
		expect(email).toEqual({
			opening: true,
			role: "counterpart",
			author: "M. Durand",
			to: "Vous",
			subject: "Compteurs",
			time: "lundi",
			text: "Bonjour",
		});
	});
});
