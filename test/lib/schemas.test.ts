import { describe, expect, it } from "vitest";
import {
	BYOK_API_BASE_URLS,
	BYOK_API_KEY_MAX_LENGTH,
	BYOK_MODEL_MAX_LENGTH,
	MAIL_TEXT_MAX_LENGTH,
	PRACTICE_UI_TEXT_MAX_LENGTH,
	USER_LONG_TEXT_MAX_LENGTH,
} from "$lib/constants";
import {
	ao3OpeningStateSchema,
	appleMailOpeningStateSchema,
	discordOpeningStateSchema,
	forgotPasswordSchema,
	getEditorFields,
	imessageOpeningStateSchema,
	openingStateSchemas,
	profileSchema,
	redditOpeningStateSchema,
	signInSchema,
	signUpSchema,
	templateContributionSchema,
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
				confirmPassword: "password123",
				name: "New User",
				activeLanguage: "en",
			}),
		).not.toThrow();
	});

	it("validates forgot password email format", () => {
		const result = forgotPasswordSchema.safeParse({ email: "invalid-email" });
		expect(result.success).toBe(false);
	});

	it("profileSchema enforces BYOK provider and credential length limits", () => {
		const validByok = {
			apiKey: "k".repeat(BYOK_API_KEY_MAX_LENGTH),
			apiBaseUrl: BYOK_API_BASE_URLS[0],
			apiModel: "m".repeat(BYOK_MODEL_MAX_LENGTH),
		};

		expect(profileSchema.safeParse(validByok).success).toBe(true);
		expect(profileSchema.safeParse({ ...validByok, apiBaseUrl: "https://api.example.com/v1" }).success).toBe(false);
		expect(profileSchema.safeParse({ ...validByok, apiKey: "k".repeat(BYOK_API_KEY_MAX_LENGTH + 1) }).success).toBe(false);
		expect(profileSchema.safeParse({ ...validByok, apiModel: "m".repeat(BYOK_MODEL_MAX_LENGTH + 1) }).success).toBe(false);
	});

	const baseTemplate = {
		language: "en",
		interactionType: "chat",
		urgency: "high",
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

	it("does not accept template isActive through the edit form schema", () => {
		const parsed = templateSchema.parse({ ...baseTemplate, isActive: "on" });
		expect("isActive" in parsed).toBe(false);
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

	it("clears unsupported translation template fields", () => {
		const result = templateSchema.parse({
			...baseTemplate,
			interactionType: "translate",
			ui: "translator",
			cadence: "none",
			shortObjectiveBase: "Translate this on the card.",
			materialsMd: "# Background",
			agentPromptBase: "a note to a close friend",
			translationReference: "An authentic source paragraph.",
		});

		expect(result.shortObjectiveBase).toBeNull();
		expect(result.materialsMd).toBeNull();
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

	// ── templateContributionSchema ─────────────────────────────────────

	const baseContribution = {
		language: "en",
		interactionType: "chat",
		urgency: "high",
		ui: "discord",
		titleBase: "Chat with {{friend}}",
	};

	it("templateContributionSchema parses minimal valid input", () => {
		const result = templateContributionSchema.parse(baseContribution);
		expect(result.titleBase).toBe("Chat with {{friend}}");
		expect(result.interactionType).toBe("chat");
	});

	it("requires urgency for non-translation templates and clears it for translation", () => {
		expect(templateSchema.safeParse({ ...baseTemplate, urgency: undefined }).success).toBe(false);
		const translation = templateSchema.parse({
			...baseTemplate,
			interactionType: "translate",
			ui: "translator",
			cadence: "none",
			urgency: "low",
			agentPromptBase: "a letter to a friend",
			translationReference: "Bonjour.",
		});
		expect(translation.urgency).toBeNull();
	});

	it("templateContributionSchema rejects missing required fields", () => {
		expect(templateContributionSchema.safeParse({}).success).toBe(false);
		expect(templateContributionSchema.safeParse({ language: "en", interactionType: "chat", ui: "discord" }).success).toBe(false);
		// missing titleBase
	});

	it("templateContributionSchema does NOT require admin-only fields", () => {
		// These fields should NOT be present or required
		const result = templateContributionSchema.parse(baseContribution) as Record<string, unknown>;
		expect(result).not.toHaveProperty("cadence");
		expect(result).not.toHaveProperty("difficulty");
		expect(result).not.toHaveProperty("pointReward");
		expect(result).not.toHaveProperty("gemReward");
		expect(result).not.toHaveProperty("isActive");
	});

	it("templateContributionSchema transforms objectivesBase newline to array", () => {
		const result = templateContributionSchema.parse({
			...baseContribution,
			objectivesBase: "Be polite\nStay on topic",
		});
		expect(result.objectivesBase).toEqual(["Be polite", "Stay on topic"]);
	});

	it("templateContributionSchema transforms tags comma to array", () => {
		const result = templateContributionSchema.parse({
			...baseContribution,
			tags: "travel, food",
		});
		expect(result.tags).toEqual(["travel", "food"]);
	});

	it("templateContributionSchema transforms translationReference paragraphs", () => {
		const result = templateContributionSchema.parse({
			...baseContribution,
			translationReference: "Hello\nWorld\n\nGoodbye",
		});
		expect(result.translationReference).toEqual(["Hello\nWorld", "Goodbye"]);
	});

	it("templateContributionSchema requires context and authentic references for translation templates", () => {
		const missing = templateContributionSchema.safeParse({
			...baseContribution,
			interactionType: "translate",
			ui: "translator",
		});
		expect(missing.success).toBe(false);
		if (!missing.success) {
			expect(missing.error.issues.map((issue) => issue.path[0])).toEqual(expect.arrayContaining(["agentPromptBase", "translationReference"]));
		}

		expect(
			templateContributionSchema.safeParse({
				...baseContribution,
				interactionType: "translate",
				ui: "translator",
				agentPromptBase: "a message to a close friend",
				translationReference: "Authentic source paragraph.",
			}).success,
		).toBe(true);
	});

	it("templateContributionSchema clears unsupported translation content", () => {
		const result = templateContributionSchema.parse({
			...baseContribution,
			interactionType: "translate",
			ui: "translator",
			shortObjectiveBase: "Translate this on the card.",
			materialsMd: "# Background",
			agentPromptBase: "a message to a close friend",
			translationReference: "Authentic source paragraph.",
		});

		expect(result.shortObjectiveBase).toBeNull();
		expect(result.materialsMd).toBeNull();
	});

	it("templateContributionSchema returns empty for optional fields when not provided", () => {
		const result = templateContributionSchema.parse(baseContribution);
		expect(result.objectivesBase).toEqual([]);
		expect(result.tags).toEqual([]);
		expect(result.translationReference).toBeNull();
		expect(result.shortObjectiveBase).toBeUndefined();
		expect(result.descriptionBase).toBeUndefined();
	});

	it("templateContributionSchema rejects invalid interactionType", () => {
		expect(templateContributionSchema.safeParse({ ...baseContribution, interactionType: "invalid" }).success).toBe(false);
	});

	it("templateContributionSchema rejects invalid language", () => {
		expect(templateContributionSchema.safeParse({ ...baseContribution, language: "de" }).success).toBe(false);
	});

	it("templateContributionSchema rejects ui/interactionType mismatch", () => {
		// translate must have ui=translator
		expect(templateContributionSchema.safeParse({ ...baseContribution, interactionType: "translate", ui: "discord" }).success).toBe(false);
		// non-translate must not have ui=translator
		expect(templateContributionSchema.safeParse({ ...baseContribution, interactionType: "chat", ui: "translator" }).success).toBe(false);
	});

	it("templateContributionSchema rejects overlong user-authored content", () => {
		expect(templateContributionSchema.safeParse({ ...baseContribution, titleBase: "x".repeat(PRACTICE_UI_TEXT_MAX_LENGTH + 1) }).success).toBe(false);
		expect(templateContributionSchema.safeParse({ ...baseContribution, materialsMd: "x".repeat(USER_LONG_TEXT_MAX_LENGTH + 1) }).success).toBe(false);
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

	it("redditOpeningStateSchema validates correctly with nested comments", () => {
		const result = redditOpeningStateSchema.parse({
			post: { title: "A post", body: "Content", subreddit: "r/test", author: "user1", votes: 42 },
			previousComments: [
				{ id: "c1", author: "commenter", text: "Nice post", timestamp: "2 hr. ago", votes: 5, replies: [{ author: "op", text: "Thanks!" }] },
			],
		});
		expect(result.post.subreddit).toBe("r/test");
		expect(result.previousComments?.[0].author).toBe("commenter");
		expect(result.previousComments?.[0].replies?.[0].text).toBe("Thanks!");
	});

	it("appleMailOpeningStateSchema validates correctly", () => {
		const result = appleMailOpeningStateSchema.parse({
			emails: [{ from: "a@b.com", to: "c@d.com", subject: "Hi", body: "Hello", time: "14:30" }],
		});
		expect(result.emails).toHaveLength(1);
		expect(result.emails[0].subject).toBe("Hi");
	});

	it("opening state schemas reject overlong shared UI text", () => {
		expect(
			imessageOpeningStateSchema.safeParse({
				previousMessages: [{ sender: "Alice", text: "x".repeat(PRACTICE_UI_TEXT_MAX_LENGTH + 1) }],
			}).success,
		).toBe(false);
		expect(
			redditOpeningStateSchema.safeParse({
				post: { title: "x".repeat(PRACTICE_UI_TEXT_MAX_LENGTH + 1), body: "Content", subreddit: "r/test", author: "user1" },
			}).success,
		).toBe(false);
		expect(ao3OpeningStateSchema.safeParse({ workTitle: "W", summary: "x".repeat(PRACTICE_UI_TEXT_MAX_LENGTH + 1) }).success).toBe(false);
	});

	it("appleMailOpeningStateSchema allows long bodies up to the mail limit", () => {
		expect(
			appleMailOpeningStateSchema.safeParse({
				emails: [{ from: "a@b.com", to: "c@d.com", subject: "Hi", body: "x".repeat(PRACTICE_UI_TEXT_MAX_LENGTH + 1) }],
			}).success,
		).toBe(true);
		expect(
			appleMailOpeningStateSchema.safeParse({
				emails: [{ from: "a@b.com", to: "c@d.com", subject: "Hi", body: "x".repeat(MAIL_TEXT_MAX_LENGTH + 1) }],
			}).success,
		).toBe(false);
	});

	it("ao3OpeningStateSchema validates correctly with optional fields and nested comments", () => {
		const result = ao3OpeningStateSchema.parse({
			workTitle: "My Fic",
			authorName: "author123",
			summary: "A fic summary",
			fandoms: ["Example Fandom"],
			additionalTags: ["fluff", "romance"],
			stats: { words: "4,500", comments: "2" },
			previousComments: [
				{
					id: "c1",
					username: "fan123",
					comment: "Great story!",
					replies: [{ username: "author123", comment: "Thank you!" }],
				},
			],
		});
		expect(result.workTitle).toBe("My Fic");
		expect(result.authorName).toBe("author123");
		expect(result.additionalTags).toEqual(["fluff", "romance"]);
		expect(result.stats?.words).toBe("4,500");
		expect(result.previousComments?.[0].username).toBe("fan123");
		expect(result.previousComments?.[0].replies?.[0].comment).toBe("Thank you!");
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
		expect(getEditorFields("reddit")[1].type).toBe("comment-tree");

		expect(getEditorFields("apple_mail")).toHaveLength(1);
		expect(getEditorFields("apple_mail")[0].type).toBe("email-list");

		expect(getEditorFields("ao3")).toHaveLength(10);
		expect(getEditorFields("ao3")[9].type).toBe("comment-tree");

		expect(getEditorFields("translator")).toHaveLength(1);
		expect(getEditorFields("translator")[0].type).toBe("textarea");
	});
});
