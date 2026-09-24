import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import { z } from "zod";
import {
	type ChatUiVariant,
	INTERACTION_TYPES,
	LANGUAGE_CODES,
	LINEUP_KINDS,
	MAIL_TEXT_MAX_LENGTH,
	PRACTICE_UI_TEXT_MAX_LENGTH,
	UI_VARIANTS,
	URGENCIES,
	USER_LONG_TEXT_MAX_LENGTH,
	USER_TEXT_MAX_LENGTH,
} from "$lib/constants";

export const TASK_JSON_VERSION = 4;

dayjs.extend(customParseFormat);

const ROTATION_OPTIONS = ["none", ...LINEUP_KINDS] as const;
export type TaskRotation = (typeof ROTATION_OPTIONS)[number];

function blankToNull(value: unknown) {
	return value === undefined || value === null || (typeof value === "string" && value.trim() === "") ? null : value;
}

/** Optional text: blank input is stored as null. */
function optionalText(max: number) {
	return z.preprocess((value) => (typeof value === "string" ? blankToNull(value.trim()) : blankToNull(value)), z.string().max(max).nullable());
}

/** A form string split by `separator`, or an already-split array (JSON import). Empty becomes null. */
function textList(separator: RegExp, max: number) {
	return z.preprocess(
		(value) => {
			if (typeof value === "string") {
				if (value.length > max) return value;
				return value
					.split(separator)
					.map((item) => item.trim())
					.filter(Boolean);
			}
			return Array.isArray(value) ? value.map((item) => (typeof item === "string" ? item.trim() : item)).filter(Boolean) : value;
		},
		z
			.array(z.string().max(max))
			.nullable()
			.optional()
			.transform((items) => (items && items.length > 0 ? items : null)),
	);
}

/** An optional positive count; blank and zero mean "none". */
const optionalCount = z.preprocess((value) => {
	const blank = blankToNull(value);
	return blank === null || Number(blank) === 0 ? null : Number(blank);
}, z.number().int().positive().nullable());

/** Opening state arrives as a JSON string from the editor and as an object from JSON import. */
const openingStateInput = z.preprocess((value) => {
	if (typeof value !== "string") return value ?? null;
	if (!value.trim()) return null;
	try {
		return JSON.parse(value);
	} catch {
		return value;
	}
}, z.record(z.string(), z.unknown()).nullable());

const taskContentShape = {
	language: z.enum(LANGUAGE_CODES),
	interactionType: z.enum(INTERACTION_TYPES),
	ui: z.enum(UI_VARIANTS),
	urgency: z.preprocess(blankToNull, z.enum(URGENCIES).nullable()),
	title: z.string().trim().min(1, "Title is required").max(USER_TEXT_MAX_LENGTH),
	shortObjective: optionalText(USER_TEXT_MAX_LENGTH),
	description: optionalText(USER_LONG_TEXT_MAX_LENGTH),
	objectives: textList(/\n/, USER_LONG_TEXT_MAX_LENGTH),
	materialsMd: optionalText(USER_LONG_TEXT_MAX_LENGTH),
	tags: textList(/,/, USER_TEXT_MAX_LENGTH),
	agentPrompt: optionalText(USER_LONG_TEXT_MAX_LENGTH),
	openingState: openingStateInput,
	referenceParagraphs: textList(/\n\s*\n/, USER_LONG_TEXT_MAX_LENGTH),
	translationContext: optionalText(USER_TEXT_MAX_LENGTH),
};

type TaskContent = z.infer<z.ZodObject<typeof taskContentShape>>;

function validateTaskContent(data: TaskContent, ctx: z.RefinementCtx) {
	if ((data.interactionType === "translate") !== (data.ui === "translator")) {
		ctx.addIssue({ code: "custom", message: 'UI must be "translator" exactly when the task is a translation', path: ["ui"] });
		return;
	}
	if (data.interactionType === "translate") {
		if (!data.translationContext) ctx.addIssue({ code: "custom", message: "Translation context is required", path: ["translationContext"] });
		if (!data.referenceParagraphs?.length) {
			ctx.addIssue({ code: "custom", message: "At least one reference paragraph is required", path: ["referenceParagraphs"] });
		}
		return;
	}
	if (!data.urgency) ctx.addIssue({ code: "custom", message: "Urgency is required", path: ["urgency"] });
	const openingState = validateOpeningState(data.ui as ChatUiVariant, data.openingState ?? {});
	if (!openingState.success) {
		ctx.addIssue({ code: "custom", message: `Invalid opening state: ${z.prettifyError(openingState.error)}`, path: ["openingState"] });
	}
}

/** Clears the columns the other task kind owns, matching the database's kind constraint. */
function normalizeTaskContent<T extends TaskContent & { maxTurns?: number | null }>(data: T): T {
	if (data.interactionType === "translate") {
		return {
			...data,
			urgency: null,
			agentPrompt: null,
			openingState: null,
			shortObjective: null,
			materialsMd: null,
			objectives: null,
			...("maxTurns" in data ? { maxTurns: null } : {}),
		};
	}
	const openingState = validateOpeningState(data.ui as ChatUiVariant, data.openingState ?? {});
	return {
		...data,
		openingState: openingState.success ? (openingState.data as Record<string, unknown>) : data.openingState,
		referenceParagraphs: null,
		translationContext: null,
	};
}

/** An admin-authored task, from the task form or a JSON import. */
export const taskSchema = z
	.object({
		...taskContentShape,
		difficulty: z.coerce.number().int().min(1).max(3),
		maxTurns: optionalCount,
		estimatedWords: optionalCount,
	})
	.superRefine(validateTaskContent)
	.transform(normalizeTaskContent);

/** A learner-proposed task. Scheduling-related and scoring fields are left to the reviewing admin. */
export const taskContributionSchema = z.object(taskContentShape).superRefine(validateTaskContent).transform(normalizeTaskContent);

/** Auto-rotation pool membership chosen in the admin task editor. */
export const taskRotationSchema = z.preprocess((value) => blankToNull(value) ?? "none", z.enum(ROTATION_OPTIONS));

/** The single-task JSON document used by admin export and import; `task` is parsed by `taskSchema`. */
export const taskJsonSchema = z.object({
	version: z.literal(TASK_JSON_VERSION),
	task: z.record(z.string(), z.unknown()),
});

/** Import-only task properties that live outside the task form. */
export const taskJsonExtrasSchema = z.object({
	isActive: z.boolean().default(true),
	rotation: taskRotationSchema.default("none"),
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
} satisfies Record<ChatUiVariant, z.ZodType>;

export function validateOpeningState(ui: ChatUiVariant, data: unknown) {
	return openingStateSchemas[ui].safeParse(data);
}

export function getEditorFields(ui: ChatUiVariant): FieldDef[] {
	return (openingStateSchemas[ui].meta() as OpeningStateEditorMeta | undefined)?.fields ?? [];
}

// ── Lineups ───────────────────────────────────────────────────────────
const ISO_WEEK = /^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/;
const CALENDAR_DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** A manual lineup entry: daily lineups take a date, weekly lineups an ISO week (`YYYY-Www`). */
export const lineupEntrySchema = z
	.object({
		taskId: z.coerce.number().int().positive(),
		kind: z.enum(LINEUP_KINDS),
		date: z.string().trim(),
	})
	.superRefine((data, ctx) => {
		if (data.kind === "weekly" ? !ISO_WEEK.test(data.date) : !(CALENDAR_DATE.test(data.date) && dayjs(data.date, "YYYY-MM-DD", true).isValid())) {
			ctx.addIssue({
				code: "custom",
				message: data.kind === "weekly" ? "Weekly lineups need an ISO week (YYYY-Www)" : "Daily lineups need a valid YYYY-MM-DD date",
				path: ["date"],
			});
		}
	});
