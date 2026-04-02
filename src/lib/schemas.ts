import { z } from 'zod';

const languageCodeValues = ['en', 'es', 'fr', 'ja'] as const;

// ── Auth ─────────────────────────────────────────────────────────────
export const signInSchema = z.object({
	email: z.string().min(1, 'Email is required').email('Invalid email'),
	password: z.string().min(1, 'Password is required')
});

export const signUpSchema = z.object({
	email: z.string().min(1, 'Email is required').email('Invalid email'),
	password: z.string().min(8, 'Password must be at least 8 characters'),
	name: z.string().min(1, 'Name is required'),
	activeLanguage: z.enum(languageCodeValues, { message: 'Please select a language' })
});

export const forgotPasswordSchema = z.object({
	email: z.string().min(1, 'Email is required').email('Invalid email')
});

export const resetPasswordSchema = z.object({
	newPassword: z.string().min(8, 'Password must be at least 8 characters'),
	token: z.string().min(1)
});

// ── App ──────────────────────────────────────────────────────────────
export const profileSchema = z.object({
	name: z.string().max(50).optional(),
	timezone: z.string().optional(),
	nativeLanguage: z.string().optional()
});

export const switchLanguageSchema = z.object({
	language: z.enum(languageCodeValues, { message: 'Invalid language' })
});

// ── Admin ────────────────────────────────────────────────────────────
function jsonField<T extends z.ZodType>(inner: T) {
	return z
		.string()
		.transform((s, ctx) => {
			try {
				return JSON.parse(s);
			} catch {
				ctx.addIssue({ code: 'custom', message: 'Invalid JSON' });
				return z.NEVER;
			}
		})
		.pipe(inner);
}

export const templateSchema = z.object({
	language: z.enum(languageCodeValues),
	type: z.enum(['chat', 'oneshot', 'slow', 'translate']),
	ui: z.enum(['reddit', 'apple_mail', 'discord', 'imessage', 'ao3', 'translator']),
	duration: z.enum(['weekly', 'daily']),
	difficulty: z.coerce.number().int().min(1).max(3),
	maxTurns: z.coerce.number().int().min(0).optional(),
	estimatedWords: z.coerce.number().int().min(0).optional(),
	pointReward: z.coerce.number().int().min(0),
	gemReward: z.coerce.number().int().min(0),
	isActive: z
		.string()
		.optional()
		.transform((v) => v === 'on'),

	titleBase: z.string().min(1, 'Title is required'),
	descriptionBase: z.string().optional(),
	agentPromptBase: z.string().optional(),
	backgroundHtml: z.string().optional(),
	objectivesBase: jsonField(z.array(z.object({ order: z.number(), text: z.string() }))),
	agentPersonaPool: jsonField(
		z.array(
			z.object({
				name: z.string(),
				age: z.number().optional(),
				personality: z.string().optional(),
				background: z.string().optional()
			})
		)
	),
	candidates: jsonField(
		z.array(
			z.object({
				slots: z.record(z.string(), z.string()),
				context: z.record(z.string(), z.unknown()).optional()
			})
		)
	)
});

export const scheduleManualSchema = z.object({
	templateId: z.coerce.number().int().positive(),
	date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
});
