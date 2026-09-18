import { describe, expect, it } from "vitest";
import { getOpeningStateMessages } from "$lib/components/practice-ui/messageTransformer";
import type { PracticeAgentPresentation, PracticeOpeningState } from "$lib/components/practice-ui/types";

describe("messageTransformer", () => {
	const mockAgentUser: PracticeAgentPresentation = {
		name: "Agent",
		accentClass: "bg-blue",
	};

	const baseParams = {
		userName: "Learner",
		agent: mockAgentUser,
		avatarUrl: "/avatar.png",
		labels: { earlier: "Earlier" },
	};

	it("returns empty array when openingStateData has no previousMessages", () => {
		const result = getOpeningStateMessages({
			...baseParams,
			openingStateData: {} as PracticeOpeningState,
		});

		expect(result).toEqual([]);
	});

	it("returns empty array when previousMessages is malformed", () => {
		const result = getOpeningStateMessages({
			...baseParams,
			openingStateData: { previousMessages: null as any } as PracticeOpeningState,
		});

		expect(result).toEqual([]);
	});

	it("converts previous messages to chat messages format", () => {
		const openingStateData: PracticeOpeningState = {
			previousMessages: [
				{ sender: "Alice", text: "Hello everyone!" },
				{ sender: "Bob", text: "Hi Alice!" },
			],
		};

		const result = getOpeningStateMessages({
			...baseParams,
			openingStateData,
		});

		expect(result).toHaveLength(2);
		expect(result[0]).toMatchObject({
			id: "opening-0-Alice",
			role: "agent",
			text: "Hello everyone!",
			timestamp: "Earlier",
			authorName: "Alice",
			deliveryState: "sent",
		});
	});

	it("identifies user messages correctly and applies avatar", () => {
		const openingStateData: PracticeOpeningState = {
			previousMessages: [{ sender: "Learner", text: "My message" }],
		};

		const result = getOpeningStateMessages({
			...baseParams,
			openingStateData,
		});

		expect(result[0]).toMatchObject({
			role: "user",
			authorName: "Learner",
			avatar: "/avatar.png",
			avatarColor: undefined,
		});
	});

	it("applies agent color to non-user messages", () => {
		const openingStateData: PracticeOpeningState = {
			previousMessages: [{ sender: "Alice", text: "Agent message" }],
		};

		const result = getOpeningStateMessages({
			...baseParams,
			openingStateData,
		});

		expect(result[0]).toMatchObject({
			role: "agent",
			avatarColor: "bg-blue",
		});
	});

	it("handles missing sender by using agent name", () => {
		const openingStateData: PracticeOpeningState = {
			previousMessages: [{ text: "Anonymous message" }],
		};

		const result = getOpeningStateMessages({
			...baseParams,
			openingStateData,
		});

		expect(result[0]).toMatchObject({
			authorName: "Agent",
			role: "agent",
		});
	});

	it.each([
		{ label: "null text", invalidText: null as any },
		{ label: "empty text", invalidText: "" },
		{ label: "whitespace text", invalidText: "   " },
		{ label: "missing text", invalidText: undefined as any },
	])("skips message when content is invalid ($label)", ({ invalidText }) => {
		const openingStateData: PracticeOpeningState = {
			previousMessages: [
				{ sender: "Alice", text: "Valid message" },
				{ sender: "Bob", text: invalidText },
				{ sender: "Charlie", text: "Another valid message" },
			],
		};

		const result = getOpeningStateMessages({
			...baseParams,
			openingStateData,
		});

		expect(result).toHaveLength(2);
		expect(result[0].text).toBe("Valid message");
		expect(result[1].text).toBe("Another valid message");
	});

	it("supports alternative field names (author instead of sender, content instead of text)", () => {
		const openingStateData: PracticeOpeningState = {
			previousMessages: [{ author: "Alice", content: "Using alternative fields" }],
		};

		const result = getOpeningStateMessages({
			...baseParams,
			openingStateData,
		});

		expect(result[0]).toMatchObject({
			authorName: "Alice",
			text: "Using alternative fields",
		});
	});

	it("skips messages with invalid sender/text fields", () => {
		const openingStateData: PracticeOpeningState = {
			previousMessages: [{ sender: null as any, text: null as any }],
		};

		const result = getOpeningStateMessages({
			...baseParams,
			openingStateData,
		});

		expect(result).toHaveLength(0);
	});

	it("generates unique IDs based on index and author name", () => {
		const openingStateData: PracticeOpeningState = {
			previousMessages: [
				{ sender: "Alice", text: "First" },
				{ sender: "Bob", text: "Second" },
				{ sender: "Alice", text: "Third" },
			],
		};

		const result = getOpeningStateMessages({
			...baseParams,
			openingStateData,
		});

		expect(result[0].id).toBe("opening-0-Alice");
		expect(result[1].id).toBe("opening-1-Bob");
		expect(result[2].id).toBe("opening-2-Alice");
	});
});
