import { describe, expect, it } from "vitest";
import { buildTaskExport, parseTaskForm, parseTaskJson } from "$lib/admin/task-actions";

function formData(entries: Record<string, string>) {
	const data = new FormData();
	for (const [key, value] of Object.entries(entries)) data.set(key, value);
	return data;
}

const chatForm = {
	language: "en",
	interactionType: "chat",
	ui: "imessage",
	urgency: "high",
	difficulty: "2",
	maxTurns: "",
	title: "Weekend plans",
	objectives: "Suggest a time\n\nAgree on a place",
	tags: "plans, friends",
	agentPrompt: "You are Sam.",
	openingState: JSON.stringify({ previousMessages: [{ sender: "Sam", text: "Free on Saturday?" }] }),
	rotation: "daily",
};

describe("parseTaskForm", () => {
	it("parses a chat task with its opening state and rotation", () => {
		const result = parseTaskForm(formData(chatForm));
		expect(result.success).toBe(true);
		if (!result.success) return;
		expect(result.rotation).toBe("daily");
		expect(result.task).toMatchObject({
			interactionType: "chat",
			maxTurns: null,
			objectives: ["Suggest a time", "Agree on a place"],
			tags: ["plans", "friends"],
			openingState: { previousMessages: [{ sender: "Sam", text: "Free on Saturday?" }] },
			referenceParagraphs: null,
			translationContext: null,
		});
	});

	it("reports an invalid opening state against its field", () => {
		const result = parseTaskForm(formData({ ...chatForm, ui: "discord", openingState: JSON.stringify({ serverName: "Only a server" }) }));
		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.errors.openingState?.[0]).toBeTruthy();
	});

	it("never rotates translation tasks and clears chat-only fields", () => {
		const result = parseTaskForm(
			formData({
				language: "fr",
				interactionType: "translate",
				ui: "translator",
				difficulty: "1",
				title: "A letter",
				agentPrompt: "stale",
				translationContext: "a warm note",
				referenceParagraphs: "Bonjour.\n\nAu revoir.",
				rotation: "weekly",
			}),
		);
		expect(result.success).toBe(true);
		if (!result.success) return;
		expect(result.rotation).toBe("none");
		expect(result.task).toMatchObject({ urgency: null, agentPrompt: null, openingState: null, referenceParagraphs: ["Bonjour.", "Au revoir."] });
	});
});

describe("task JSON", () => {
	it("round-trips an export through import", () => {
		const parsed = parseTaskForm(formData(chatForm));
		if (!parsed.success) throw new Error("fixture must parse");
		const exported = JSON.stringify(buildTaskExport({ ...parsed.task, isActive: false }, "weekly"));

		const imported = parseTaskJson(exported);

		expect(imported).toEqual({ success: true, data: { task: parsed.task, isActive: false, rotation: "weekly" } });
	});

	it("rejects documents from the template era", () => {
		const result = parseTaskJson(JSON.stringify({ version: 3, template: {}, variants: [] }));
		expect(result.success).toBe(false);
	});
});
