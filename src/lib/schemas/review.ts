import { z } from "zod";
import { LANGUAGE_CODES, REVIEW_MAXIMUM_INTERVAL_DAYS, USER_TEXT_MAX_LENGTH } from "$lib/constants";
import { NOTE_EXAMPLE_COUNT } from "$lib/note";

export const reviewRatingSchema = z.object({
	rating: z.number().int().min(1).max(4),
	elapsedSeconds: z.number().int().min(0),
});

const noteExampleSchema = z.object({
	targetText: z.string().trim().min(1, "Every target-language example is required").max(USER_TEXT_MAX_LENGTH),
	nativeText: z.string().trim().min(1, "Every native-language example is required").max(USER_TEXT_MAX_LENGTH),
});

export const managedNoteUpdateSchema = z
	.object({
		noteId: z.coerce.number().int().positive(),
		language: z.enum(LANGUAGE_CODES),
		vocab: z.string().trim().min(1, "Vocabulary is required").max(USER_TEXT_MAX_LENGTH),
		targetDefinition: z.string().trim().min(1, "Target-language definition is required").max(USER_TEXT_MAX_LENGTH),
		nativeDefinition: z.string().trim().min(1, "Native-language definition is required").max(USER_TEXT_MAX_LENGTH),
		examples: z.array(noteExampleSchema).length(NOTE_EXAMPLE_COUNT),
	})
	.refine((value) => new Set(value.examples.map((example) => `${example.targetText}\u0000${example.nativeText}`)).size === NOTE_EXAMPLE_COUNT, {
		message: "Examples must be distinct",
		path: ["examples"],
	});

export const managedNoteIdSchema = z.object({ noteId: z.coerce.number().int().positive() });

export const managedNoteSetDueSchema = managedNoteIdSchema.extend({
	days: z.coerce.number().int().min(0).max(REVIEW_MAXIMUM_INTERVAL_DAYS),
});
