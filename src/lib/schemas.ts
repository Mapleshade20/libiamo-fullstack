import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import { z } from "zod";
import { CADENCES, INTERACTION_TYPES, LANGUAGE_CODES, UI_VARIANTS, type UiVariant } from "$lib/constants";

dayjs.extend(customParseFormat);

// ── Auth ─────────────────────────────────────────────────────────────
export const timezoneSchema = z.preprocess(
	(v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
	z
		.string()
		.optional()
		.refine(
			(tz) => {
				if (!tz) return true;
				try {
					Intl.DateTimeFormat(undefined, { timeZone: tz });
					return true;
				} catch {
					return false;
				}
			},
			{
				message: "Invalid timezone format. Please use a valid IANA timezone (e.g., Asia/Shanghai).",
			},
		),
);

export const signInSchema = z.object({
	email: z.email("Invalid email"),
	password: z.string().min(1, "Password is required"),
});

export const signUpSchema = z.object({
	email: z.email("Invalid email"),
	password: z.string().min(8, "Password must be at least 8 characters"),
	name: z.string().min(1, "Name is required"),
	activeLanguage: z.enum(LANGUAGE_CODES, { message: "Please select a language" }),
	timezone: timezoneSchema,
});

export const forgotPasswordSchema = z.object({
	email: z.email("Invalid email"),
});

export const resetPasswordSchema = z.object({
	newPassword: z.string().min(8, "Password must be at least 8 characters"),
	token: z.string().min(1, "Invalid token"),
});

// ── App ──────────────────────────────────────────────────────────────
export const profileSchema = z.object({
	name: z.string().max(50).optional(),
	timezone: timezoneSchema,
	nativeLanguage: z.string().optional(),
});

export const switchLanguageSchema = z.object({
	language: z.enum(LANGUAGE_CODES, { message: "Invalid language" }),
});

// ── Admin ────────────────────────────────────────────────────────────
export const templateSchema = z.object({
	language: z.enum(LANGUAGE_CODES),
	interactionType: z.enum(INTERACTION_TYPES),
	ui: z.enum(UI_VARIANTS),
	cadence: z.enum(CADENCES),
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
	// passagesBase: text → string[][] (paragraphs of sentences)
	passagesBase: z
		.string()
		.optional()
		.transform((v) => {
			if (!v) return null;
			const paragraphs = v
				.split(/\n\s*\n/)
				.map((para) =>
					para
						.split("\n")
						.map((s) => s.trim())
						.filter(Boolean),
				)
				.filter((para) => para.length > 0);
			return paragraphs.length > 0 ? paragraphs : null;
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
	sender: z.string(),
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
				sender: z.string(),
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
			time: z.string().optional(),
		}),
	),
});

export const ao3OpeningStateSchema = z.object({
	workTitle: z.string(),
	chapterTitle: z.string().optional(),
	bodyExcerpt: z.string().optional(),
	tags: z.array(z.string()).optional(),
	previousComments: z
		.array(
			z.object({
				username: z.string(),
				comment: z.string(),
			}),
		)
		.optional(),
});

export const translatorOpeningStateSchema = z.object({
	sourceText: z.string(),
});

// ── Opening state editor metadata ─────────────────────────────────────
export type FieldDef =
	| { type: "text"; key: string; label: string; placeholder?: string; required?: boolean }
	| { type: "textarea"; key: string; label: string; rows?: number; placeholder?: string; required?: boolean }
	| { type: "number"; key: string; label: string; placeholder?: string }
	| { type: "message-list"; key: string; label: string; withTimestamp?: boolean }
	| { type: "email-list"; key: string; label: string }
	| {
			type: "comment-list";
			key: string;
			label: string;
			authorField?: string;
			textField?: string;
			authorPlaceholder?: string;
			textPlaceholder?: string;
			withVotes?: boolean;
	  }
	| { type: "group"; key: string; label: string; fields: FieldDef[] }
	| { type: "row"; fields: FieldDef[] };

export type OpeningStateEditorMeta = {
	fields: FieldDef[];
};

// ── Schema registry keyed by UiVariant ────────────────────────────────

export const openingStateSchemas = {
	imessage: imessageOpeningStateSchema.meta({
		fields: [{ type: "message-list", key: "previousMessages", label: "Previous Messages" }],
	} satisfies OpeningStateEditorMeta),
	discord: discordOpeningStateSchema.meta({
		fields: [
			{
				type: "row",
				fields: [
					{ type: "text", key: "serverName", label: "Server Name", placeholder: "My Server" },
					{ type: "text", key: "channelName", label: "Channel Name", placeholder: "general" },
				],
			},
			{ type: "message-list", key: "previousMessages", label: "Previous Messages", withTimestamp: true },
		],
	} satisfies OpeningStateEditorMeta),
	reddit: redditOpeningStateSchema.meta({
		fields: [
			{
				type: "group",
				key: "post",
				label: "Post",
				fields: [
					{
						type: "row",
						fields: [
							{ type: "text", key: "title", label: "Title" },
							{ type: "text", key: "subreddit", label: "Subreddit", placeholder: "AskReddit" },
						],
					},
					{
						type: "row",
						fields: [
							{ type: "text", key: "author", label: "Author" },
							{ type: "number", key: "votes", label: "Votes" },
						],
					},
					{ type: "textarea", key: "body", label: "Body", rows: 3 },
				],
			},
			{ type: "comment-list", key: "previousComments", label: "Previous Comments" },
		],
	} satisfies OpeningStateEditorMeta),
	apple_mail: appleMailOpeningStateSchema.meta({
		fields: [{ type: "email-list", key: "emails", label: "Emails" }],
	} satisfies OpeningStateEditorMeta),
	ao3: ao3OpeningStateSchema.meta({
		fields: [
			{ type: "text", key: "workTitle", label: "Work Title", required: true },
			{ type: "text", key: "chapterTitle", label: "Chapter Title (optional)" },
			{ type: "textarea", key: "bodyExcerpt", label: "Body Excerpt (optional)", rows: 3 },
			{ type: "text", key: "tags", label: "Tags (comma-separated)", placeholder: "Angst, Fluff, Slow Burn" },
			{
				type: "comment-list",
				key: "previousComments",
				label: "Previous Comments",
				authorField: "username",
				textField: "comment",
				authorPlaceholder: "Username",
				textPlaceholder: "Comment",
				withVotes: false,
			},
		],
	} satisfies OpeningStateEditorMeta),
	translator: translatorOpeningStateSchema.meta({
		fields: [{ type: "textarea", key: "sourceText", label: "Source Text", rows: 4, placeholder: "Text to translate...", required: true }],
	} satisfies OpeningStateEditorMeta),
} satisfies Record<UiVariant, z.ZodType>;

export function validateOpeningState(ui: UiVariant, data: unknown) {
	return openingStateSchemas[ui].safeParse(data);
}

export function getEditorFields(ui: UiVariant): FieldDef[] {
	return (openingStateSchemas[ui].meta() as OpeningStateEditorMeta | undefined)?.fields ?? [];
}

// ── Schedule ──────────────────────────────────────────────────────────
export const scheduleManualSchema = z.object({
	templateId: z.coerce.number().int().positive(),
	// Validate both ISO week formats and real calendar dates
	date: z.string().refine((value) => {
		const standardDateRegex = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
		// Restrict weeks to valid ISO range: 01 to 53
		const isoWeekRegex = /^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/;

		if (isoWeekRegex.test(value)) {
			return true;
		}
		if (!standardDateRegex.test(value)) {
			return false;
		}

		// Ensure the date actually exists (e.g., prevent Feb 30th)
		return dayjs(value, "YYYY-MM-DD", true).isValid();
	}, "Date must be a valid YYYY-MM-DD or YYYY-Www format"),
});
