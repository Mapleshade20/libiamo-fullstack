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

const byokRefine = (data: { apiKey?: string; apiBaseUrl?: string; apiModel?: string }) => {
	const hasApiKey = data.apiKey?.trim();
	const hasBaseUrl = data.apiBaseUrl?.trim();
	const hasModel = data.apiModel?.trim();
	if (hasApiKey || hasBaseUrl || hasModel) {
		if (!hasApiKey || !hasBaseUrl || !hasModel) return false;
	}
	return true;
};

const byokMessage = "All three fields (API Key, Base URL, Model) are required when configuring BYOK";

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
export const profileSchema = z
	.object({
		name: z.string().max(50).optional(),
		timezone: timezoneSchema,
		nativeLanguage: z.string().optional(),
		apiKey: z.string().optional(),
		apiBaseUrl: z.url().optional(),
		apiModel: z.string().optional(),
	})
	.refine(byokRefine, {
		message: byokMessage,
		path: ["apiKey"],
	});

export const switchLanguageSchema = z.object({
	language: z.enum(LANGUAGE_CODES, { message: "Invalid language" }),
});

// ── Admin ────────────────────────────────────────────────────────────

const templateContentFields = {
	titleBase: z.string().min(1, "Title is required"),
	shortObjectiveBase: z.string().optional(),
	descriptionBase: z.string().optional(),
	materialsMd: z.string().optional(),
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
	translationBase: z
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
};

const templateCore = {
	language: z.enum(LANGUAGE_CODES),
	interactionType: z.enum(INTERACTION_TYPES),
	ui: z.enum(UI_VARIANTS),
	...templateContentFields,
};

const translateUiRefine = (data: { interactionType: string; ui: string }) => (data.interactionType === "translate") === (data.ui === "translator");

const translateUiMessage = 'UI must be "translator" when interaction type is "translate", and must not be "translator" otherwise';

export const templateSchema = z
	.object({
		...templateCore,
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
		agentStartsFirst: z.any().transform((v) => v === "on"),
		agentPromptBase: z.string().optional(),
	})
	.refine(translateUiRefine, { message: translateUiMessage, path: ["ui"] });

export const templateContributionSchema = z.object({ ...templateCore }).refine(translateUiRefine, { message: translateUiMessage, path: ["ui"] });

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

export type RedditCommentInput = {
	id?: string;
	author: string;
	text: string;
	timestamp?: string;
	votes?: number;
	replies?: RedditCommentInput[];
};

const redditCommentSchema: z.ZodType<RedditCommentInput> = z.object({
	id: z.string().optional(),
	author: z.string(),
	text: z.string(),
	timestamp: z.string().optional(),
	votes: z.number().optional(),
	replies: z.lazy(() => z.array(redditCommentSchema)).optional(),
});

export const redditOpeningStateSchema = z.object({
	post: z.object({
		title: z.string(),
		body: z.string(),
		subreddit: z.string(),
		author: z.string(),
		votes: z.number().optional(),
	}),
	previousComments: z.array(redditCommentSchema).optional(),
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

export type Ao3CommentInput = {
	id?: string;
	username: string;
	comment: string;
	timestamp?: string;
	chapterTitle?: string;
	iconUrl?: string;
	replies?: Ao3CommentInput[];
};

const ao3CommentSchema: z.ZodType<Ao3CommentInput> = z.object({
	id: z.string().optional(),
	username: z.string(),
	comment: z.string(),
	timestamp: z.string().optional(),
	chapterTitle: z.string().optional(),
	iconUrl: z.string().optional(),
	replies: z.lazy(() => z.array(ao3CommentSchema)).optional(),
});

export const ao3OpeningStateSchema = z.object({
	workTitle: z.string(),
	authorName: z.string().optional(),
	chapterTitle: z.string().optional(),
	summary: z.string().optional(),
	bodyExcerpt: z.string().optional(),
	rating: z.string().optional(),
	archiveWarning: z.string().optional(),
	categories: z.array(z.string()).optional(),
	fandoms: z.array(z.string()).optional(),
	relationships: z.array(z.string()).optional(),
	characters: z.array(z.string()).optional(),
	additionalTags: z.array(z.string()).optional(),
	tags: z.array(z.string()).optional(),
	stats: z
		.object({
			published: z.string().optional(),
			updated: z.string().optional(),
			words: z.string().optional(),
			chapters: z.string().optional(),
			comments: z.string().optional(),
			kudos: z.string().optional(),
			bookmarks: z.string().optional(),
			hits: z.string().optional(),
		})
		.optional(),
	previousComments: z.array(ao3CommentSchema).optional(),
});

export const translatorOpeningStateSchema = z.object({
	sourceText: z.string().min(1, "Source text is required"),
});

// ── Opening state editor metadata ─────────────────────────────────────
export type FieldDef =
	| { type: "text"; key: string; label: string; placeholder?: string; required?: boolean }
	| { type: "textarea"; key: string; label: string; rows?: number; placeholder?: string; required?: boolean }
	| { type: "number"; key: string; label: string; placeholder?: string }
	| { type: "message-list"; key: string; label: string; withTimestamp?: boolean }
	| { type: "email-list"; key: string; label: string }
	| {
			type: "comment-tree";
			key: string;
			label: string;
			authorField?: string;
			textField?: string;
			authorLabel?: string;
			textLabel?: string;
			authorPlaceholder?: string;
			textPlaceholder?: string;
			withTimestamp?: boolean;
			withIconUrl?: boolean;
			withVotes?: boolean;
	  }
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
			{
				type: "comment-tree",
				key: "previousComments",
				label: "Previous Comments",
				authorField: "author",
				textField: "text",
				authorLabel: "Author",
				textLabel: "Comment",
				withTimestamp: true,
				withVotes: true,
			},
		],
	} satisfies OpeningStateEditorMeta),
	apple_mail: appleMailOpeningStateSchema.meta({
		fields: [{ type: "email-list", key: "emails", label: "Emails" }],
	} satisfies OpeningStateEditorMeta),
	ao3: ao3OpeningStateSchema.meta({
		fields: [
			{
				type: "row",
				fields: [
					{ type: "text", key: "workTitle", label: "Work Title", required: true },
					{ type: "text", key: "authorName", label: "Author Name", placeholder: "FicAuthor" },
				],
			},
			{ type: "text", key: "chapterTitle", label: "Chapter Title (optional)" },
			{ type: "textarea", key: "summary", label: "Summary (optional)", rows: 3 },
			{ type: "textarea", key: "bodyExcerpt", label: "Body Excerpt (optional)", rows: 4 },
			{
				type: "row",
				fields: [
					{ type: "text", key: "rating", label: "Rating", placeholder: "Teen And Up Audiences" },
					{ type: "text", key: "archiveWarning", label: "Archive Warning", placeholder: "No Archive Warnings Apply" },
				],
			},
			{ type: "text", key: "fandoms", label: "Fandoms (comma-separated)", placeholder: "Original Work, Example Fandom" },
			{ type: "text", key: "relationships", label: "Relationships (comma-separated)" },
			{ type: "text", key: "characters", label: "Characters (comma-separated)" },
			{ type: "text", key: "additionalTags", label: "Additional Tags (comma-separated)", placeholder: "Angst, Fluff, Slow Burn" },
			{
				type: "comment-tree",
				key: "previousComments",
				label: "Previous Comments",
				authorField: "username",
				textField: "comment",
				authorLabel: "Username",
				textLabel: "Comment",
				withTimestamp: true,
				withIconUrl: true,
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

// ── Tutor Feedback (AI structured output) ────────────────────────────
export const tutorFeedbackSchema = z.object({
	content: z.string().describe("Overall feedback text for the student"),
	objectiveResults: z
		.array(
			z.object({
				text: z.string().describe("The objective being evaluated"),
				grade: z.enum(["A", "B", "C"]).describe("A = excellent, B = good, C = needs improvement"),
			}),
		)
		.describe("Per-objective evaluation results"),
});

export type TutorFeedback = z.infer<typeof tutorFeedbackSchema>;

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
