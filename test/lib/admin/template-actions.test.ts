import { describe, expect, it } from "vitest";
import { parseTemplateJson, prepareVariantPayload } from "$lib/admin/template-actions";

const baseTemplate = {
	ui: "imessage" as const,
	titleBase: "Chat with {{friend}} about {{topic}}",
	shortObjectiveBase: null,
	descriptionBase: null,
	agentPromptBase: null,
	objectivesBase: null,
};

describe("prepareVariantPayload", () => {
	it("returns validated payload when all slots are present and opening state is valid", () => {
		const result = prepareVariantPayload(baseTemplate, { friend: "Alice", topic: "weather" }, { previousMessages: [] });

		expect(result.error).toBeUndefined();
		if (!result.error) {
			expect(result.slotValues).toEqual({ friend: "Alice", topic: "weather" });
			expect(result.openingState).toEqual({ previousMessages: [] });
		}
	});

	it("returns error when required slots are missing", () => {
		const result = prepareVariantPayload(baseTemplate, { friend: "Alice" }, { previousMessages: [] });

		expect(result.error).toBeDefined();
		expect(result.error).toContain("missing slot values");
		expect(result.error).toContain("topic");
		expect(result.slotValues).toBeUndefined();
	});

	it("returns error when slot value is empty string", () => {
		const result = prepareVariantPayload(baseTemplate, { friend: "Alice", topic: "" }, { previousMessages: [] });

		expect(result.error).toBeDefined();
		expect(result.error).toContain("topic");
	});

	it("returns error for invalid opening state", () => {
		const result = prepareVariantPayload(
			{ ...baseTemplate, ui: "discord" },
			{ friend: "Alice", topic: "weather" },
			{ serverName: "My Server" }, // missing required channelName
		);

		expect(result.error).toBeDefined();
		expect(result.error).toContain("Invalid opening state");
		expect(result.error).toContain("discord");
	});

	it("uses custom prefix in missing-slots error message", () => {
		const result = prepareVariantPayload(baseTemplate, {}, { previousMessages: [] }, "First variant");

		expect(result.error).toBeDefined();
		expect(result.error).toMatch(/^First variant is missing/);
	});

	it("uses default 'Variant' prefix when not specified", () => {
		const result = prepareVariantPayload(baseTemplate, {}, { previousMessages: [] });

		expect(result.error).toBeDefined();
		expect(result.error).toMatch(/^Variant is missing/);
	});

	it("handles template with no slots required", () => {
		const noSlotsTemplate = {
			ui: "imessage" as const,
			titleBase: "Simple chat",
			shortObjectiveBase: null,
			descriptionBase: null,
			agentPromptBase: null,
			objectivesBase: null,
		};

		const result = prepareVariantPayload(noSlotsTemplate, {}, { previousMessages: [] });

		expect(result.error).toBeUndefined();
		if (!result.error) {
			expect(result.slotValues).toEqual({});
			expect(result.openingState).toEqual({ previousMessages: [] });
		}
	});

	it("validates discord opening state with all required fields", () => {
		const discordTemplate = {
			...baseTemplate,
			ui: "discord" as const,
		};

		const result = prepareVariantPayload(
			discordTemplate,
			{ friend: "Alice", topic: "weather" },
			{ serverName: "My Server", channelName: "general", previousMessages: [] },
		);

		expect(result.error).toBeUndefined();
	});

	it("returns error for discord opening state missing required fields", () => {
		const discordTemplate = {
			...baseTemplate,
			ui: "discord" as const,
		};

		const result = prepareVariantPayload(
			discordTemplate,
			{ friend: "Alice", topic: "weather" },
			{ serverName: "My Server" }, // missing channelName
		);

		expect(result.error).toBeDefined();
		expect(result.error).toContain("Invalid opening state for discord");
	});

	it("finds slots in all text fields (titleBase, descriptionBase, etc.)", () => {
		const multiSlotTemplate = {
			ui: "imessage" as const,
			titleBase: "Chat with {{friend}}",
			shortObjectiveBase: "Discuss {{topic}}",
			descriptionBase: "You will talk about {{topic}} with {{friend}}",
			agentPromptBase: "Play the role of {{role}}",
			objectivesBase: null,
		};

		// missing 'role'
		const result = prepareVariantPayload(multiSlotTemplate, { friend: "Alice", topic: "weather" }, { previousMessages: [] });

		expect(result.error).toBeDefined();
		expect(result.error).toContain("role");
	});

	it("finds slots in objectivesBase array", () => {
		const objTemplate = {
			ui: "imessage" as const,
			titleBase: "Chat",
			shortObjectiveBase: null,
			descriptionBase: null,
			agentPromptBase: null,
			objectivesBase: ["Introduce yourself to {{person}}", "Ask about {{hobby}}"],
		};

		const result = prepareVariantPayload(
			objTemplate,
			{ person: "Bob" }, // missing hobby
			{ previousMessages: [] },
		);

		expect(result.error).toBeDefined();
		expect(result.error).toContain("hobby");
	});
});

describe("parseTemplateJson", () => {
	const validPayload = {
		version: 1,
		template: {
			language: "en",
			interactionType: "chat",
			ui: "imessage",
			cadence: "daily",
			difficulty: 1,
			pointReward: 10,
			gemReward: 5,
			titleBase: "Chat with {{friend}}",
		},
		variants: [{ isActive: true, slotValues: { friend: "Alice" }, openingState: { previousMessages: [] } }],
	};

	it("parses and validates exported template JSON", () => {
		const result = parseTemplateJson(JSON.stringify(validPayload));

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.template.titleBase).toBe("Chat with {{friend}}");
			expect(result.data.variants[0].slotValues).toEqual({ friend: "Alice" });
		}
	});

	it("rejects invalid JSON", () => {
		const result = parseTemplateJson("not json");

		expect(result.success).toBe(false);
		if (!result.success) expect(result.error).toBe("Invalid JSON.");
	});

	it("rejects non-translation templates without variants", () => {
		const result = parseTemplateJson(JSON.stringify({ ...validPayload, variants: [] }));

		expect(result.success).toBe(false);
		if (!result.success) expect(result.error).toContain("at least one variant");
	});

	it("rejects variants missing required slots", () => {
		const result = parseTemplateJson(
			JSON.stringify({
				...validPayload,
				variants: [{ isActive: true, slotValues: {}, openingState: { previousMessages: [] } }],
			}),
		);

		expect(result.success).toBe(false);
		if (!result.success) expect(result.error).toContain("friend");
	});
});
