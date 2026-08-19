import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import { z } from "zod";
import {
	CADENCES,
	INTERACTION_TYPES,
	LANGUAGE_CODES,
	MAIL_TEXT_MAX_LENGTH,
	PRACTICE_UI_TEXT_MAX_LENGTH,
	UI_VARIANTS,
	type UiVariant,
	URGENCIES,
	USER_LONG_TEXT_MAX_LENGTH,
	USER_TEXT_MAX_LENGTH,
} from "$lib/constants";

dayjs.extend(customParseFormat);

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
	translationReference: z
		.string()
		.optional()
		.transform((v) => {
			if (!v) return null;
			const paragraphs = v
				.split(/\n\s*\n/)
				.map((paragraph) => paragraph.trim())
				.filter(Boolean);
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

const contributionContentFields = {
	titleBase: z.string().min(1, "Title is required").max(USER_TEXT_MAX_LENGTH),
	shortObjectiveBase: z.string().max(USER_TEXT_MAX_LENGTH).optional(),
	descriptionBase: z.string().max(USER_TEXT_MAX_LENGTH).optional(),
	materialsMd: z.string().max(USER_LONG_TEXT_MAX_LENGTH).optional(),
	objectivesBase: z
		.string()
		.max(USER_LONG_TEXT_MAX_LENGTH)
		.optional()
		.transform((v) => {
			if (!v) return [];
			return v
				.split("\n")
				.map((s) => s.trim())
				.filter(Boolean);
		}),
	agentPromptBase: z.string().max(USER_TEXT_MAX_LENGTH).optional(),
	translationReference: z
		.string()
		.max(USER_LONG_TEXT_MAX_LENGTH)
		.optional()
		.transform((v) => {
			if (!v) return null;
			const paragraphs = v
				.split(/\n\s*\n/)
				.map((paragraph) => paragraph.trim())
				.filter(Boolean);
			return paragraphs.length > 0 ? paragraphs : null;
		}),
	tags: z
		.string()
		.max(USER_TEXT_MAX_LENGTH)
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
	urgency: z.enum(URGENCIES).nullable().optional(),
	...templateContentFields,
};

const templateContributionCore = {
	language: z.enum(LANGUAGE_CODES),
	interactionType: z.enum(INTERACTION_TYPES),
	ui: z.enum(UI_VARIANTS),
	urgency: z.enum(URGENCIES).nullable().optional(),
	...contributionContentFields,
};

const translateUiRefine = (data: { interactionType: string; ui: string }) => (data.interactionType === "translate") === (data.ui === "translator");

const translateUiMessage = 'UI must be "translator" when interaction type is "translate", and must not be "translator" otherwise';

function validateTranslationContent(
	data: { interactionType: string; urgency?: string | null; agentPromptBase?: string | null; translationReference?: string[] | null },
	ctx: z.RefinementCtx,
) {
	if (data.interactionType !== "translate") {
		if (!data.urgency) ctx.addIssue({ code: "custom", message: "Urgency is required", path: ["urgency"] });
		return;
	}
	if (!data.agentPromptBase?.trim()) {
		ctx.addIssue({ code: "custom", message: "Translation context is required", path: ["agentPromptBase"] });
	}
	if (!data.translationReference?.length) {
		ctx.addIssue({ code: "custom", message: "At least one reference paragraph is required", path: ["translationReference"] });
	}
}

function normalizeTranslationContent<T extends { interactionType: string; shortObjectiveBase?: string | null; materialsMd?: string | null }>(
	data: T,
) {
	return data.interactionType === "translate" ? { ...data, shortObjectiveBase: null, materialsMd: null } : data;
}

export const templateSchema = z
	.object({
		...templateCore,
		cadence: z.enum(CADENCES),
		difficulty: z.coerce.number().int().min(1).max(3),
		maxTurns: z.coerce.number().int().min(0).optional(),
		estimatedWords: z.coerce.number().int().min(0).optional(),
		pointReward: z.coerce.number().int().min(0),
		gemReward: z.coerce.number().int().min(0),
		agentStartsFirst: z.any().transform((v) => v === "on"),
		agentPromptBase: z.string().optional(),
	})
	.refine(translateUiRefine, { message: translateUiMessage, path: ["ui"] })
	.superRefine(validateTranslationContent)
	.transform(normalizeTranslationContent)
	.transform((data) => (data.interactionType === "translate" ? { ...data, agentStartsFirst: false, urgency: null } : data));

export const templateContributionSchema = z
	.object({ ...templateContributionCore })
	.refine(translateUiRefine, { message: translateUiMessage, path: ["ui"] })
	.superRefine(validateTranslationContent)
	.transform(normalizeTranslationContent)
	.transform((data) => (data.interactionType === "translate" ? { ...data, urgency: null } : data));

// ── Variant ───────────────────────────────────────────────────────────
export const variantSchema = z.object({
	slotValues: z.record(z.string(), z.string()).default({}),
	openingState: z.record(z.string(), z.unknown()).default({}),
	isActive: z.boolean().default(true),
});

// ── openingState per-UI schemas ───────────────────────────────────────
const uiText = z.string().max(PRACTICE_UI_TEXT_MAX_LENGTH);
const mailText = z.string().max(MAIL_TEXT_MAX_LENGTH);

const messageSchema = z.object({
	sender: uiText,
	text: uiText,
});

export const imessageOpeningStateSchema = z.object({
	previousMessages: z.array(messageSchema).default([]),
});

export const discordOpeningStateSchema = z.object({
	serverName: uiText,
	channelName: uiText,
	previousMessages: z
		.array(
			z.object({
				sender: uiText,
				text: uiText,
				timestamp: uiText.optional(),
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
	author: uiText,
	text: uiText,
	timestamp: uiText.optional(),
	votes: z.number().optional(),
	replies: z.lazy(() => z.array(redditCommentSchema)).optional(),
});

export const redditOpeningStateSchema = z.object({
	post: z.object({
		title: uiText,
		body: uiText,
		subreddit: uiText,
		author: uiText,
		votes: z.number().optional(),
	}),
	previousComments: z.array(redditCommentSchema).optional(),
});

export const appleMailOpeningStateSchema = z.object({
	emails: z.array(
		z.object({
			from: uiText,
			to: uiText,
			subject: uiText,
			body: mailText,
			time: uiText.optional(),
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
	username: uiText,
	comment: uiText,
	timestamp: uiText.optional(),
	chapterTitle: uiText.optional(),
	iconUrl: uiText.optional(),
	replies: z.lazy(() => z.array(ao3CommentSchema)).optional(),
});

export const ao3OpeningStateSchema = z.object({
	workTitle: uiText,
	authorName: uiText.optional(),
	chapterTitle: uiText.optional(),
	summary: uiText.optional(),
	bodyExcerpt: uiText.optional(),
	rating: uiText.optional(),
	archiveWarning: uiText.optional(),
	categories: z.array(uiText).optional(),
	fandoms: z.array(uiText).optional(),
	relationships: z.array(uiText).optional(),
	characters: z.array(uiText).optional(),
	additionalTags: z.array(uiText).optional(),
	tags: z.array(uiText).optional(),
	stats: z
		.object({
			published: uiText.optional(),
			updated: uiText.optional(),
			words: uiText.optional(),
			chapters: uiText.optional(),
			comments: uiText.optional(),
			kudos: uiText.optional(),
			bookmarks: uiText.optional(),
			hits: uiText.optional(),
		})
		.optional(),
	previousComments: z.array(ao3CommentSchema).optional(),
});

export const translatorOpeningStateSchema = z.object({
	sourceText: uiText.min(1, "Source text is required"),
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
