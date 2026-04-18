import { describe, expect, it } from "vitest";
import {
	ao3OpeningStateSchema,
	appleMailOpeningStateSchema,
	discordOpeningStateSchema,
	forgotPasswordSchema,
	getEditorFields,
	imessageOpeningStateSchema,
	openingStateSchemas,
	redditOpeningStateSchema,
	signInSchema,
	signUpSchema,
	templateSchema,
	translatorOpeningStateSchema,
	validateOpeningState,
	variantSchema,
} from "$lib/schemas";

describe("schemas", () => {
	it("validates sign-in and sign-up basic success cases", () => {
		expect(() =>
			signInSchema.parse({
				email: "user@example.com",
				password: "password123",
			}),
		).not.toThrow();

		expect(() =>
			signUpSchema.parse({
				email: "new@example.com",
				password: "password123",
				name: "New User",
				activeLanguage: "en",
			}),
		).not.toThrow();
	});

	it("validates forgot password email format", () => {
		const result = forgotPasswordSchema.safeParse({ email: "invalid-email" });
		expect(result.success).toBe(false);
	});

	const baseTemplate = {
		language: "en",
		interactionType: "chat",
		ui: "discord",
		cadence: "daily",
		difficulty: 2,
		maxTurns: 3,
		estimatedWords: 40,
		pointReward: 10,
		gemReward: 1,
		titleBase: "Hello",
		descriptionBase: "desc",
		agentPromptBase: "prompt",
		materialsMd: "# Background",
	};

	it("transforms template isActive from on to true and off to false", () => {
		const onParsed = templateSchema.parse({ ...baseTemplate, isActive: "on" });
		expect(onParsed.isActive).toBe(true);

		const offParsed = templateSchema.parse({ ...baseTemplate, isActive: "off" });
		expect(offParsed.isActive).toBe(false);
	});

	it("transforms objectivesBase newline string to array", () => {
		const result = templateSchema.parse({
			...baseTemplate,
			objectivesBase: "First objective\nSecond objective\n",
		});
		expect(result.objectivesBase).toEqual(["First objective", "Second objective"]);
	});

	it("transforms tags comma string to array", () => {
		const result = templateSchema.parse({
			...baseTemplate,
			tags: "travel, food, culture",
		});
		expect(result.tags).toEqual(["travel", "food", "culture"]);
	});

	it("returns empty arrays for missing objectivesBase and tags", () => {
		const result = templateSchema.parse(baseTemplate);
		expect(result.objectivesBase).toEqual([]);
		expect(result.tags).toEqual([]);
	});

	it("returns error when required template fields are missing", () => {
		const result = templateSchema.safeParse({
			language: "en",
			interactionType: "chat",
			ui: "discord",
			cadence: "daily",
			difficulty: 2,
			pointReward: 10,
			gemReward: 1,
			// titleBase missing
		});
		expect(result.success).toBe(false);
	});

	it("returns error for invalid interactionType enum value", () => {
		const result = templateSchema.safeParse({ ...baseTemplate, interactionType: "invalid" });
		expect(result.success).toBe(false);
	});

	it("returns error for invalid cadence enum value", () => {
		const result = templateSchema.safeParse({ ...baseTemplate, cadence: "monthly" });
		expect(result.success).toBe(false);
	});

	// ── variantSchema ─────────────────────────────────────────────────

	it("variantSchema parses valid variant data", () => {
		const result = variantSchema.parse({
			slotValues: { name: "Lina", topic: "music" },
			openingState: { serverName: "Test", channelName: "general", previousMessages: [] },
			isActive: true,
		});
		expect(result.slotValues).toEqual({ name: "Lina", topic: "music" });
		expect(result.isActive).toBe(true);
	});

	it("variantSchema applies defaults for missing optional fields", () => {
		const result = variantSchema.parse({});
		expect(result.slotValues).toEqual({});
		expect(result.openingState).toEqual({});
		expect(result.isActive).toBe(true);
	});

	// ── openingState per-UI schemas ───────────────────────────────────

	it("imessageOpeningStateSchema validates correctly", () => {
		const result = imessageOpeningStateSchema.parse({
			previousMessages: [{ sender: "Alice", text: "Hello" }],
		});
		expect(result.previousMessages).toHaveLength(1);
		expect(result.previousMessages[0].sender).toBe("Alice");
	});

	it("discordOpeningStateSchema validates correctly", () => {
		const result = discordOpeningStateSchema.parse({
			serverName: "My Server",
			channelName: "general",
			previousMessages: [{ sender: "Bob", text: "Hi", timestamp: "10:00" }],
		});
		expect(result.serverName).toBe("My Server");
		expect(result.previousMessages[0].timestamp).toBe("10:00");
	});

	it("discordOpeningStateSchema rejects missing serverName", () => {
		const result = discordOpeningStateSchema.safeParse({
			channelName: "general",
		});
		expect(result.success).toBe(false);
	});

	it("redditOpeningStateSchema validates correctly", () => {
		const result = redditOpeningStateSchema.parse({
			post: { title: "A post", body: "Content", subreddit: "r/test", author: "user1", votes: 42 },
			previousComments: [{ author: "commenter", text: "Nice post", votes: 5 }],
		});
		expect(result.post.subreddit).toBe("r/test");
		expect(result.previousComments?.[0].author).toBe("commenter");
	});

	it("appleMailOpeningStateSchema validates correctly", () => {
		const result = appleMailOpeningStateSchema.parse({
			emails: [{ from: "a@b.com", to: "c@d.com", subject: "Hi", body: "Hello", time: "14:30" }],
		});
		expect(result.emails).toHaveLength(1);
		expect(result.emails[0].subject).toBe("Hi");
	});

	it("ao3OpeningStateSchema validates correctly with optional fields", () => {
		const result = ao3OpeningStateSchema.parse({
			workTitle: "My Fic",
			tags: ["fluff", "romance"],
			previousComments: [{ username: "fan123", comment: "Great story!" }],
		});
		expect(result.workTitle).toBe("My Fic");
		expect(result.tags).toEqual(["fluff", "romance"]);
		expect(result.chapterTitle).toBeUndefined();
		expect(result.previousComments?.[0].username).toBe("fan123");
	});

	it("translatorOpeningStateSchema validates correctly", () => {
		const result = translatorOpeningStateSchema.parse({ sourceText: "Bonjour" });
		expect(result.sourceText).toBe("Bonjour");
	});

	it("translatorOpeningStateSchema rejects missing sourceText", () => {
		const result = translatorOpeningStateSchema.safeParse({});
		expect(result.success).toBe(false);
	});

	// ── validateOpeningState helper ───────────────────────────────────

	it("validateOpeningState routes to correct schema for each ui", () => {
		expect(validateOpeningState("imessage", { previousMessages: [] }).success).toBe(true);
		expect(
			validateOpeningState("discord", {
				serverName: "S",
				channelName: "C",
				previousMessages: [],
			}).success,
		).toBe(true);
		expect(
			validateOpeningState("reddit", {
				post: { title: "T", body: "B", subreddit: "r/x", author: "u" },
			}).success,
		).toBe(true);
		expect(
			validateOpeningState("apple_mail", {
				emails: [{ from: "a@b.com", to: "c@d.com", subject: "s", body: "b" }],
			}).success,
		).toBe(true);
		expect(validateOpeningState("ao3", { workTitle: "W" }).success).toBe(true);
		expect(validateOpeningState("translator", { sourceText: "text" }).success).toBe(true);
	});

	it("validateOpeningState returns failure for wrong shape", () => {
		expect(validateOpeningState("discord", { serverName: "S" }).success).toBe(false);
		expect(validateOpeningState("translator", {}).success).toBe(false);
	});

	// ── openingStateSchemas registry ────────────────────────────────────

	it("openingStateSchemas covers all UI variants", () => {
		const uis = ["imessage", "discord", "reddit", "apple_mail", "ao3", "translator"] as const;
		for (const ui of uis) {
			expect(openingStateSchemas[ui]).toBeDefined();
			expect(typeof openingStateSchemas[ui].safeParse).toBe("function");
		}
	});

	// ── getEditorFields helper ──────────────────────────────────────────

	it("getEditorFields returns fields for each UI variant", () => {
		expect(getEditorFields("imessage")).toHaveLength(1);
		expect(getEditorFields("imessage")[0].type).toBe("message-list");

		expect(getEditorFields("discord")).toHaveLength(2);
		expect(getEditorFields("discord")[0].type).toBe("row");

		expect(getEditorFields("reddit")).toHaveLength(2);
		expect(getEditorFields("reddit")[0].type).toBe("group");
		expect(getEditorFields("reddit")[1].type).toBe("comment-list");

		expect(getEditorFields("apple_mail")).toHaveLength(1);
		expect(getEditorFields("apple_mail")[0].type).toBe("email-list");

		expect(getEditorFields("ao3")).toHaveLength(5);

		expect(getEditorFields("translator")).toHaveLength(1);
		expect(getEditorFields("translator")[0].type).toBe("textarea");
	});
});
