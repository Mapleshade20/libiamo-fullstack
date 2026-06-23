import { describe, expect, it } from "vitest";
import { buildTemplateImportPreview, summarizeSlotValues } from "$lib/admin/template-import-preview";

const validTemplate = {
	language: "en",
	interactionType: "chat",
	ui: "imessage",
	cadence: "daily",
	difficulty: 1,
	pointReward: 10,
	gemReward: 5,
	titleBase: "Chat with {{friend}} about {{topic}}",
};

describe("summarizeSlotValues", () => {
	it("summarizes slot values briefly", () => {
		expect(summarizeSlotValues({ friend: "Alice", topic: "weather", mood: "happy", place: "cafe" })).toBe(
			"friend: Alice · topic: weather · mood: happy · +1 more",
		);
	});

	it("handles empty or non-object values", () => {
		expect(summarizeSlotValues({})).toBe("No slot values");
		expect(summarizeSlotValues(null)).toBe("No slot values");
	});
});

describe("buildTemplateImportPreview", () => {
	it("previews edited, created, and deactivated variants", () => {
		const result = buildTemplateImportPreview(
			JSON.stringify({
				version: 1,
				template: validTemplate,
				variants: [
					{
						id: 2,
						isActive: true,
						slotValues: { friend: "Alice", topic: "weather" },
						openingState: { previousMessages: [] },
					},
					{
						isActive: true,
						slotValues: { friend: "Bob", topic: "music" },
						openingState: { previousMessages: [] },
					},
				],
			}),
			[
				{ id: 2, slotValues: { friend: "Old Alice", topic: "old weather" } },
				{ id: 3, slotValues: { friend: "Carol", topic: "games" } },
			],
		);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.items).toEqual([
				{ id: 2, title: "friend: Alice · topic: weather", status: "Edited" },
				{ id: null, title: "friend: Bob · topic: music", status: "Created" },
				{ id: 3, title: "friend: Carol · topic: games", status: "Deactivated" },
			]);
		}
	});

	it("returns parse errors for invalid import JSON", () => {
		const result = buildTemplateImportPreview("not json", []);

		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toBe("Invalid JSON.");
	});

	it("rejects duplicate variant ids", () => {
		const result = buildTemplateImportPreview(
			JSON.stringify({
				version: 1,
				template: validTemplate,
				variants: [
					{ id: 2, isActive: true, slotValues: { friend: "Alice", topic: "weather" }, openingState: { previousMessages: [] } },
					{ id: 2, isActive: true, slotValues: { friend: "Bob", topic: "music" }, openingState: { previousMessages: [] } },
				],
			}),
			[{ id: 2, slotValues: { friend: "Alice", topic: "weather" } }],
		);

		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toContain("duplicate variant ids");
	});

	it("rejects ids that do not belong to the current template", () => {
		const result = buildTemplateImportPreview(
			JSON.stringify({
				version: 1,
				template: validTemplate,
				variants: [{ id: 999, isActive: true, slotValues: { friend: "Alice", topic: "weather" }, openingState: { previousMessages: [] } }],
			}),
			[{ id: 2, slotValues: { friend: "Alice", topic: "weather" } }],
		);

		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toContain("does not belong to this template");
	});
});
