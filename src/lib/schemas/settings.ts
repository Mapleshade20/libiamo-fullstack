import { z } from "zod";
import {
	BYOK_API_BASE_URLS,
	BYOK_API_KEY_MAX_LENGTH,
	BYOK_MODEL_MAX_LENGTH,
	FEEDBACK_LANGUAGE_MODES,
	LANGUAGE_CODES,
	NATIVE_LANGUAGE_CODES,
	USER_NAME_MAX_LENGTH,
} from "$lib/constants";

const byokFields = ["apiKey", "apiBaseUrl", "apiModel"] as const;
const byokMessage = "All three fields (API Key, Base URL, Model) are required when configuring BYOK";

export const profileSchema = z
	.object({
		name: z.string().max(USER_NAME_MAX_LENGTH).optional(),
		nativeLanguage: z.preprocess(
			(v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
			z.enum(NATIVE_LANGUAGE_CODES, { message: "Please select a supported native language" }).optional(),
		),
		feedbackLanguagePreference: z.enum(FEEDBACK_LANGUAGE_MODES).optional(),
		apiKey: z.string().max(BYOK_API_KEY_MAX_LENGTH).optional(),
		apiBaseUrl: z.enum(BYOK_API_BASE_URLS, { message: "Please select a supported API provider" }).optional(),
		apiModel: z.string().max(BYOK_MODEL_MAX_LENGTH).optional(),
	})
	.superRefine((data, ctx) => {
		const filled = byokFields.map((f) => data[f]?.trim());
		if (filled.some(Boolean) && !filled.every(Boolean)) {
			byokFields.forEach((f, i) => {
				if (!filled[i]) ctx.addIssue({ code: z.ZodIssueCode.custom, message: byokMessage, path: [f] });
			});
		}
	});

export const switchLanguageSchema = z.object({
	language: z.enum(LANGUAGE_CODES, { message: "Invalid language" }),
});
