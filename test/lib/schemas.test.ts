import { describe, expect, it } from "vitest";
import { forgotPasswordSchema, signInSchema, signUpSchema, templateSchema } from "../../src/lib/schemas";

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

	it("transforms template isActive from on to true and off to false", () => {
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

		const onParsed = templateSchema.parse({ ...baseTemplate, isActive: "on" });
		expect(onParsed.isActive).toBe(true);

		const offParsed = templateSchema.parse({ ...baseTemplate, isActive: "off" });
		expect(offParsed.isActive).toBe(false);
	});

	it("returns error when template JSON fields are invalid", () => {
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
