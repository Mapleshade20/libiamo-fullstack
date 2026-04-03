import { describe, expect, it } from "vitest";
import { forgotPasswordSchema, signInSchema, signUpSchema, templateSchema } from "../../src/lib/schemas";

// This file tests pure validation/transformation rules in schemas.ts.
// Because schemas are pure functions (no DB/network), these tests do NOT need mocks.
describe("schemas", () => {
	it("validates sign-in and sign-up basic success cases", () => {
		// Happy paths: valid payloads should parse without throwing.
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
		// Invalid email should be rejected by schema.
		const result = forgotPasswordSchema.safeParse({ email: "invalid-email" });
		expect(result.success).toBe(false);
	});

	it("transforms template isActive from on to true and off to false", () => {
		// Base payload for template schema tests.
		const baseTemplate = {
			language: "en",
			type: "chat",
			ui: "discord",
			duration: "daily",
			difficulty: 2,
			maxTurns: 3,
			estimatedWords: 40,
			pointReward: 10,
			gemReward: 1,
			titleBase: "Hello",
			descriptionBase: "desc",
			agentPromptBase: "prompt",
			backgroundHtml: "<p>bg</p>",
			objectivesBase: JSON.stringify([{ order: 1, text: "obj" }]),
			agentPersonaPool: JSON.stringify([{ name: "persona" }]),
			candidates: JSON.stringify([{ slots: { topic: "coffee" }, context: {} }]),
		};

		// isActive is transformed by schema: 'on' -> true, anything else -> false.
		const onParsed = templateSchema.parse({ ...baseTemplate, isActive: "on" });
		expect(onParsed.isActive).toBe(true);

		const offParsed = templateSchema.parse({ ...baseTemplate, isActive: "off" });
		expect(offParsed.isActive).toBe(false);
	});

	it("returns error when template JSON fields are invalid", () => {
		// objectivesBase expects JSON; invalid JSON should fail with schema error.
		const result = templateSchema.safeParse({
			language: "en",
			type: "chat",
			ui: "discord",
			duration: "daily",
			difficulty: 2,
			pointReward: 10,
			gemReward: 1,
			titleBase: "Hello",
			objectivesBase: "not-json",
			agentPersonaPool: JSON.stringify([{ name: "persona" }]),
			candidates: JSON.stringify([{ slots: { topic: "coffee" } }]),
		});

		expect(result.success).toBe(false);
	});
});
