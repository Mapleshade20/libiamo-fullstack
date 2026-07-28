import { z } from "zod";
import { NOTE_EXAMPLE_COUNT } from "$lib/note";
import { TRANSLATION_GRADES } from "$lib/translation-evaluation/types";

const NonEmptyTextSchema = z.string().trim().min(1);
const GradeSchema = z.enum(TRANSLATION_GRADES);

export const Generation1CardSchema = z
	.object({
		sourceText: NonEmptyTextSchema,
		originalAnswer: NonEmptyTextSchema,
		initialHint: NonEmptyTextSchema,
		deeperHint: NonEmptyTextSchema,
		referenceAnswer: NonEmptyTextSchema,
		referenceMarked: NonEmptyTextSchema,
		minimalAnswer: NonEmptyTextSchema,
		minimalDiff: NonEmptyTextSchema,
		teacherNotes: z.array(NonEmptyTextSchema).min(1),
	})
	.strict();

export const Generation1Schema = z
	.object({
		overallCommentary: NonEmptyTextSchema,
		ratings: z
			.object({
				accuracy: GradeSchema,
				naturalness: GradeSchema,
				grammar: GradeSchema,
				overall: GradeSchema,
			})
			.strict(),
		cards: z.array(Generation1CardSchema),
	})
	.strict();

const CorrectionChecksSchema = z
	.object({
		allCardIssuesResolved: z.boolean(),
		noNewErrors: z.boolean(),
		fullyNatural: z.boolean(),
	})
	.strict();
const PassingCorrectionChecksSchema = z
	.object({
		allCardIssuesResolved: z.literal(true),
		noNewErrors: z.literal(true),
		fullyNatural: z.literal(true),
	})
	.strict();
const CorrectionRejectSchema = z.object({ verdict: z.literal("reject"), checks: CorrectionChecksSchema, feedback: NonEmptyTextSchema }).strict();
const CorrectionAcceptSchema = z
	.object({ verdict: z.literal("accept"), checks: PassingCorrectionChecksSchema, acceptedDiff: NonEmptyTextSchema })
	.strict();
export const CorrectionVerifierSchema = z
	.discriminatedUnion("verdict", [CorrectionRejectSchema, CorrectionAcceptSchema])
	.superRefine((value, context) => {
		if (value.verdict === "reject" && Object.values(value.checks).every(Boolean)) {
			context.addIssue({ code: "custom", path: ["checks"], message: "A rejected correction must have at least one failed check." });
		}
	});

export const SecondDraftVerifierSchema = z
	.object({
		cards: z.array(z.object({ ordinal: z.number().int().nonnegative(), resolved: z.boolean() }).strict()),
		commentary: NonEmptyTextSchema,
	})
	.strict();

export const Generation2Schema = z
	.object({
		notes: z.array(
			z
				.object({
					sourceCardOrdinals: z.array(z.number().int().nonnegative()).min(1),
					vocab: NonEmptyTextSchema,
					targetDefinition: NonEmptyTextSchema,
					nativeDefinition: NonEmptyTextSchema,
					examples: z.array(z.object({ targetText: NonEmptyTextSchema, nativeText: NonEmptyTextSchema }).strict()).length(NOTE_EXAMPLE_COUNT),
				})
				.strict(),
		),
	})
	.strict();

export type Generation1Card = z.infer<typeof Generation1CardSchema>;
export type Generation1Evaluation = z.infer<typeof Generation1Schema>;
export type CorrectionVerification = z.infer<typeof CorrectionVerifierSchema>;
export type SecondDraftVerification = z.infer<typeof SecondDraftVerifierSchema>;
export type Generation2Result = z.infer<typeof Generation2Schema>;
