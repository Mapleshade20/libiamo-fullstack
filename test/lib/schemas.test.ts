import { describe, expect, it } from "vitest";
import {
	BYOK_API_BASE_URLS,
	BYOK_API_KEY_MAX_LENGTH,
	BYOK_MODEL_MAX_LENGTH,
	MAIL_TEXT_MAX_LENGTH,
	PRACTICE_UI_TEXT_MAX_LENGTH,
	USER_LONG_TEXT_MAX_LENGTH,
	USER_TEXT_MAX_LENGTH,
} from "$lib/constants";
import {
	ao3OpeningStateSchema,
	appleMailOpeningStateSchema,
	discordOpeningStateSchema,
	forgotPasswordSchema,
	getEditorFields,
	imessageOpeningStateSchema,
	lineupEntrySchema,
	openingStateSchemas,
	profileSchema,
	redditOpeningStateSchema,
	signInSchema,
	signUpSchema,
	taskContributionSchema,
	taskSchema,
	validateOpeningState,
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

	const discordOpening = { serverName: "Study group", channelName: "general", previousMessages: [] };
	const baseTask = {
		language: "en",
		interactionType: "chat",
		urgency: "high",
		ui: "discord",
		difficulty: 2,
		maxTurns: 3,
		estimatedWords: 40,
		title: "Hello",
		description: "desc",
		agentPrompt: "prompt",
		materialsMd: "# Background",
		openingState: JSON.stringify(discordOpening),
	};
	const translationTask = {
		...baseTask,
		interactionType: "translate",
		ui: "translator",
		translationContext: "a note to a close friend",
		referenceParagraphs: "An authentic source paragraph.",
	};

	it("does not accept task isActive through the edit form schema", () => {
		const parsed = taskSchema.parse({ ...baseTask, isActive: "on" });
		expect("isActive" in parsed).toBe(false);
	});

	it("splits objectives by line and tags by comma", () => {
		const result = taskSchema.parse({ ...baseTask, objectives: "First objective\nSecond objective\n", tags: "travel, food, culture" });
		expect(result.objectives).toEqual(["First objective", "Second objective"]);
		expect(result.tags).toEqual(["travel", "food", "culture"]);
	});

	it("stores blank optional content as null", () => {
		const result = taskSchema.parse({ ...baseTask, shortObjective: "  ", objectives: "", maxTurns: "", estimatedWords: "0" });
		expect(result).toMatchObject({ shortObjective: null, objectives: null, tags: null, maxTurns: null, estimatedWords: null });
	});

	it("validates the opening state for the chosen chat interface", () => {
		expect(taskSchema.safeParse({ ...baseTask, openingState: JSON.stringify({ serverName: "Only a server" }) }).success).toBe(false);
		expect(taskSchema.parse(baseTask).openingState).toEqual(discordOpening);
	});

	it("requires urgency for chat tasks", () => {
		expect(taskSchema.safeParse({ ...baseTask, urgency: "" }).success).toBe(false);
	});

	it("keeps only translation content on translation tasks", () => {
		const result = taskSchema.parse({ ...translationTask, shortObjective: "Translate this on the card.", maxTurns: 3 });
		expect(result).toMatchObject({
			urgency: null,
			maxTurns: null,
			agentPrompt: null,
			openingState: null,
			shortObjective: null,
			materialsMd: null,
			translationContext: "a note to a close friend",
			referenceParagraphs: ["An authentic source paragraph."],
		});
	});

	it("requires context and authentic references for translation tasks", () => {
		const missing = taskSchema.safeParse({ ...baseTask, interactionType: "translate", ui: "translator" });
		expect(missing.success).toBe(false);
		if (!missing.success) {
			expect(missing.error.issues.map((issue) => issue.path[0])).toEqual(expect.arrayContaining(["translationContext", "referenceParagraphs"]));
		}
	});

	it("splits reference paragraphs on blank lines", () => {
		const result = taskSchema.parse({ ...translationTask, referenceParagraphs: "Hello\nWorld\n\nGoodbye" });
		expect(result.referenceParagraphs).toEqual(["Hello\nWorld", "Goodbye"]);
	});

	it("rejects ui/interactionType mismatches and invalid enum values", () => {
		expect(taskSchema.safeParse({ ...translationTask, ui: "discord" }).success).toBe(false);
		expect(taskSchema.safeParse({ ...baseTask, ui: "translator" }).success).toBe(false);
		expect(taskSchema.safeParse({ ...baseTask, interactionType: "invalid" }).success).toBe(false);
		expect(taskSchema.safeParse({ ...baseTask, title: "" }).success).toBe(false);
	});

	// ── taskContributionSchema ─────────────────────────────────────────

	const baseContribution = {
		language: "en",
		interactionType: "chat",
		urgency: "high",
		ui: "discord",
		title: "Chat with a friend",
		openingState: JSON.stringify(discordOpening),
	};

	it("taskContributionSchema leaves scheduling and scoring to the reviewing admin", () => {
		const result = taskContributionSchema.parse({ ...baseContribution, difficulty: 3, maxTurns: 4 }) as Record<string, unknown>;
		expect(result.title).toBe("Chat with a friend");
		for (const field of ["difficulty", "maxTurns", "estimatedWords", "isActive", "rotation"]) expect(result).not.toHaveProperty(field);
	});

	it("taskContributionSchema rejects missing required fields and invalid values", () => {
		expect(taskContributionSchema.safeParse({}).success).toBe(false);
		expect(taskContributionSchema.safeParse({ ...baseContribution, title: undefined }).success).toBe(false);
		expect(taskContributionSchema.safeParse({ ...baseContribution, language: "de" }).success).toBe(false);
	});

	it("taskContributionSchema rejects overlong user-authored content", () => {
		expect(taskContributionSchema.safeParse({ ...baseContribution, title: "x".repeat(USER_TEXT_MAX_LENGTH + 1) }).success).toBe(false);
		expect(taskContributionSchema.safeParse({ ...baseContribution, materialsMd: "x".repeat(USER_LONG_TEXT_MAX_LENGTH + 1) }).success).toBe(false);
	});

	// ── lineupEntrySchema ──────────────────────────────────────────────

	it("lineupEntrySchema takes dates for daily lineups and ISO weeks for weekly ones", () => {
		expect(lineupEntrySchema.safeParse({ taskId: "3", kind: "daily", date: "2026-09-24" }).success).toBe(true);
		expect(lineupEntrySchema.safeParse({ taskId: "3", kind: "daily", date: "2026-02-30" }).success).toBe(false);
		expect(lineupEntrySchema.safeParse({ taskId: "3", kind: "weekly", date: "2026-W39" }).success).toBe(true);
		expect(lineupEntrySchema.safeParse({ taskId: "3", kind: "weekly", date: "2026-09-24" }).success).toBe(false);
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
	});

	it("validateOpeningState returns failure for wrong shape", () => {
		expect(validateOpeningState("discord", { serverName: "S" }).success).toBe(false);
	});

	// ── openingStateSchemas registry ────────────────────────────────────

	it("openingStateSchemas covers all UI variants", () => {
		const uis = ["imessage", "discord", "reddit", "apple_mail", "ao3"] as const;
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
	});
});
