import { describe, expect, it } from "vitest";
import {
	buildChatTranscript,
	buildSceneTranscript,
	describeLevel,
	renderScenarioSetting,
	renderTaskBrief,
} from "$lib/server/practice/prompt-context";

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

const scene = (name: string, address = "") => ({ counterpart: { name, address }, cast: [{ name, address }], group: false, open: false });

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
			scene: scene("Mario"),
			messages: [
				{ id: 1, role: "user", content: "hice uno" },
				{ id: 2, role: "assistant", content: "¡genial!", llmMetadata: { assistantAuthorName: "Lucía", replyTo: "opening-0" } },
				{ id: 3, role: "user", content: "oculto", llmMetadata: { hidden: true } },
				{ id: 4, role: "system", content: "internal" },
			],
		});
		expect(transcript).toEqual([
			{ id: 1, opening: true, role: "cast", author: "Mario", text: "hola" },
			{ id: 2, opening: true, role: "cast", author: "Lucía", text: "¿mods nuevos?" },
			{ id: 3, opening: true, role: "learner", author: "Maple", text: "yo" },
			{ id: 4, role: "learner", author: "Maple", text: "hice uno" },
			{ id: 5, replyTo: 1, role: "cast", author: "Lucía", text: "¡genial!" },
		]);
	});

	it("numbers a comment thread and points every reply at its parent, with refs back to the stored ids", () => {
		const { entries, refs } = buildSceneTranscript({
			ui: "reddit",
			openingState: {
				previousComments: [{ id: "c1", author: "alex", text: "Voice scams.", replies: [{ id: "c2", author: "luma", text: "Family password." }] }],
			},
			learnerName: "Maple",
			scene: scene("op_user"),
			messages: [
				{
					id: 10,
					role: "user",
					content: "Same here",
					llmMetadata: { clientMessageId: "m1", thread: { commentId: "reddit-user-m1", targetCommentId: "c2" } },
				},
				{ id: 11, role: "assistant", content: "nah", llmMetadata: { assistantAuthorName: "alex", thread: { parentCommentId: "reddit-user-m1" } } },
				{ id: 12, role: "assistant", content: "new take", llmMetadata: { assistantAuthorName: "zed" } },
			],
		});
		expect(entries.map(({ id, replyTo, author }) => [id, replyTo ?? null, author])).toEqual([
			[1, null, "alex"],
			[2, 1, "luma"],
			[3, 2, "Maple"],
			[4, 3, "alex"],
			[5, null, "zed"],
		]);
		expect(refs).toEqual(["c1", "c2", "reddit-user-m1", "reddit-agent-11", "reddit-agent-12"]);
	});

	it("keeps opening email headers", () => {
		const [email] = buildChatTranscript({
			ui: "apple_mail",
			openingState: { emails: [{ from: "M. Durand <durand@x.example>", to: "Vous", subject: "Compteurs", body: "Bonjour", time: "lundi" }] },
			learnerName: "Maple",
			scene: scene("M. Durand", "durand@x.example"),
			messages: [],
		});
		expect(email).toEqual({
			id: 1,
			opening: true,
			role: "cast",
			author: "M. Durand",
			to: "Vous",
			subject: "Compteurs",
			time: "lundi",
			text: "Bonjour",
		});
	});
});
