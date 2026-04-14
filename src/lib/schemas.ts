import { z } from "zod";

const languageCodeValues = ["en", "es", "fr", "ja"] as const;
const uiVariantValues = ["reddit", "apple_mail", "discord", "imessage", "ao3", "translator"] as const;

// ── Auth ─────────────────────────────────────────────────────────────
export const signInSchema = z.object({
	email: z.string().min(1, "Email is required").email("Invalid email"),
	password: z.string().min(1, "Password is required"),
});

export const signUpSchema = z.object({
	email: z.string().min(1, "Email is required").email("Invalid email"),
	password: z.string().min(8, "Password must be at least 8 characters"),
	name: z.string().min(1, "Name is required"),
	activeLanguage: z.enum(languageCodeValues, { message: "Please select a language" }),
});

export const forgotPasswordSchema = z.object({
	email: z.string().min(1, "Email is required").email("Invalid email"),
});

export const resetPasswordSchema = z.object({
	newPassword: z.string().min(8, "Password must be at least 8 characters"),
	token: z.string().min(1),
});

// ── App ──────────────────────────────────────────────────────────────
export const profileSchema = z.object({
	name: z.string().max(50).optional(),
	timezone: z.string().optional(),
	nativeLanguage: z.string().optional(),
});

export const switchLanguageSchema = z.object({
	language: z.enum(languageCodeValues, { message: "Invalid language" }),
});

// ── Admin ────────────────────────────────────────────────────────────
export const templateSchema = z.object({
	language: z.enum(languageCodeValues),
	interactionType: z.enum(["chat", "oneshot", "slow", "translate"]),
	ui: z.enum(uiVariantValues),
	cadence: z.enum(["weekly", "daily"]),
	difficulty: z.coerce.number().int().min(1).max(3),
	maxTurns: z.coerce.number().int().min(0).optional(),
	estimatedWords: z.coerce.number().int().min(0).optional(),
	pointReward: z.coerce.number().int().min(0),
	gemReward: z.coerce.number().int().min(0),
	isActive: z
		.string()
		.optional()
		.transform((v) => v === "on"),

	titleBase: z.string().min(1, "Title is required"),
	shortObjectiveBase: z.string().optional(),
	descriptionBase: z.string().optional(),
	agentPromptBase: z.string().optional(),
	materialsMd: z.string().optional(),
	// objectives: newline-separated string → string[]
	objectivesBase: z
		.string()
		.optional()
		.transform((v) => {
			if (!v) return [];
			return v
				.split("\n")
				.map((s) => s.trim())
				.filter(Boolean);
		}),
	// tags: comma-separated string → string[]
	tags: z
		.string()
		.optional()
		.transform((v) => {
			if (!v) return [];
			return v
				.split(",")
				.map((s) => s.trim())
				.filter(Boolean);
		}),
});

// ── Variant ───────────────────────────────────────────────────────────
export const variantSchema = z.object({
	slotValues: z.record(z.string(), z.string()).default({}),
	openingState: z.record(z.string(), z.unknown()).default({}),
	isActive: z.boolean().default(true),
});

// ── openingState per-UI schemas ───────────────────────────────────────
const messageSchema = z.object({
	sender: z.enum(["user", "agent"]),
	text: z.string(),
});

export const imessageOpeningStateSchema = z.object({
	previousMessages: z.array(messageSchema).default([]),
});

export const discordOpeningStateSchema = z.object({
	serverName: z.string(),
	channelName: z.string(),
	previousMessages: z
		.array(
			z.object({
				sender: z.enum(["user", "agent"]),
				text: z.string(),
				timestamp: z.string().optional(),
			}),
		)
		.default([]),
});

export const redditOpeningStateSchema = z.object({
	post: z.object({
		title: z.string(),
		body: z.string(),
		subreddit: z.string(),
		author: z.string(),
		votes: z.number().optional(),
	}),
	previousComments: z
		.array(
			z.object({
				author: z.string(),
				text: z.string(),
				votes: z.number().optional(),
			}),
		)
		.optional(),
});

export const appleMailOpeningStateSchema = z.object({
	emails: z.array(
		z.object({
			from: z.string(),
			to: z.string(),
			subject: z.string(),
			body: z.string(),
			date: z.string().optional(),
		}),
	),
});

export const ao3OpeningStateSchema = z.object({
	workTitle: z.string(),
	chapterTitle: z.string().optional(),
	bodyExcerpt: z.string().optional(),
	tags: z.array(z.string()).optional(),
});

export const translatorOpeningStateSchema = z.object({
	sourceText: z.string(),
});

// ── validateOpeningState discriminated helper ─────────────────────────
type UiVariant = (typeof uiVariantValues)[number];

export function validateOpeningState(ui: UiVariant, data: unknown) {
	switch (ui) {
		case "imessage":
			return imessageOpeningStateSchema.safeParse(data);
		case "discord":
			return discordOpeningStateSchema.safeParse(data);
		case "reddit":
			return redditOpeningStateSchema.safeParse(data);
		case "apple_mail":
			return appleMailOpeningStateSchema.safeParse(data);
		case "ao3":
			return ao3OpeningStateSchema.safeParse(data);
		case "translator":
			return translatorOpeningStateSchema.safeParse(data);
	}
}

// ── Schedule ──────────────────────────────────────────────────────────
export const scheduleManualSchema = z.object({
	templateId: z.coerce.number().int().positive(),
	date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
});
