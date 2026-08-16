import { createHash } from "node:crypto";
import { and, count, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getLanguageEnglishName, TRANSLATION_CANDIDATE_COUNT } from "$lib/constants";
import { db } from "$lib/server/db";
import { translationAnswer, translationAttempt, translationSourceSet } from "$lib/server/db/schema";
import { chatJson } from "$lib/server/llm";

export const TRANSLATION_VOTE_THRESHOLD = 30;

const VariantsSchema = z.object({
	paragraphs: z.array(
		z.object({
			paragraphIndex: z.number().int().nonnegative(),
			candidates: z.array(z.string().trim().min(1)).min(1),
		}),
	),
});

export type GenerateTranslationVariantsInput = {
	userId: string;
	paragraphs: string[];
	sourceLanguage: string;
	targetLanguage: string;
	context: string;
	candidateCount?: number;
};

const SPANISH_GREETING_VARIANTS = [
	"Hola.",
	"Buenas.",
	"¿Qué tal?",
	"Saludos.",
	"Muy buenas.",
	"Buenas tardes.",
	"Un saludo.",
	"Hola a todos.",
	"Encantado de saludarles.",
];

const SPANISH_FAREWELL_VARIANTS = [
	"Adiós.",
	"Hasta luego.",
	"Nos vemos.",
	"Hasta pronto.",
	"Que te vaya bien.",
	"Hasta la próxima.",
	"Nos vemos pronto.",
	"Me despido.",
	"Hasta otra ocasión.",
];

const ENGLISH_THANKS_VARIANTS = [
	"Thank you very much.",
	"Thanks so much.",
	"I really appreciate it.",
	"Many thanks.",
	"I am very grateful.",
	"Thank you kindly.",
	"I truly appreciate that.",
	"Thanks a million.",
	"I cannot thank you enough.",
];

function variantsFewShotMessages(candidateCount: number) {
	return [
		{
			role: "user" as const,
			content: `FORMAT EXAMPLE 1\nTranslate from English to Spanish and return exactly ${candidateCount} candidates for each paragraph.\n\n[Paragraph 0]\nHello.\n\n[Paragraph 1]\nGoodbye.`,
		},
		{
			role: "assistant" as const,
			content: JSON.stringify({
				paragraphs: [
					{ paragraphIndex: 0, candidates: SPANISH_GREETING_VARIANTS.slice(0, candidateCount) },
					{ paragraphIndex: 1, candidates: SPANISH_FAREWELL_VARIANTS.slice(0, candidateCount) },
				],
			}),
		},
		{
			role: "user" as const,
			content: `FORMAT EXAMPLE 2\nTranslate from Japanese to English and return exactly ${candidateCount} candidates for each paragraph.\n\n[Paragraph 0]\n本当にありがとうございます。`,
		},
		{
			role: "assistant" as const,
			content: JSON.stringify({
				paragraphs: [{ paragraphIndex: 0, candidates: ENGLISH_THANKS_VARIANTS.slice(0, candidateCount) }],
			}),
		},
	];
}

export function validateTranslationCandidates(candidates: string[][], paragraphCount: number, candidateCount = TRANSLATION_CANDIDATE_COUNT) {
	if (candidates.length !== paragraphCount) throw new Error("The AI response did not cover every paragraph.");
	for (const paragraph of candidates) {
		if (paragraph.length !== candidateCount || paragraph.some((candidate) => !candidate.trim())) {
			throw new Error(`Every paragraph must have exactly ${candidateCount} non-empty candidates.`);
		}
	}
}

export async function generateTranslationVariants({
	userId,
	paragraphs,
	sourceLanguage,
	targetLanguage,
	context,
	candidateCount = TRANSLATION_CANDIDATE_COUNT,
}: GenerateTranslationVariantsInput): Promise<string[][]> {
	if (!Number.isInteger(candidateCount) || candidateCount < 1 || candidateCount > 10) throw new Error("Candidate count must be between 1 and 10.");
	if (paragraphs.length === 0 || paragraphs.some((paragraph) => !paragraph.trim())) throw new Error("Source paragraphs must be non-empty.");
	if (!context.trim()) throw new Error("Translation context must be non-empty.");
	const outputShape = JSON.stringify({
		paragraphs: [
			{
				paragraphIndex: 0,
				candidates: Array.from({ length: candidateCount }, (_, index) => `<candidate ${index + 1}>`),
			},
		],
	});

	const { value: result } = await chatJson({
		schema: VariantsSchema,
		userId,
		messages: [
			{
				role: "system",
				content: `You are a literary and pragmatic translator. Translate each ${getLanguageEnglishName(sourceLanguage)} paragraph into ${getLanguageEnglishName(targetLanguage)}. Produce exactly ${candidateCount} natural alternatives per paragraph. Preserve meaning, register, voice, and paragraph boundaries; vary phrasing without adding facts.

OUTPUT CONTRACT:
- Return ONLY one valid JSON object. Do not use Markdown fences or add any explanation.
- Use exactly this shape: ${outputShape}
- Return every input paragraph exactly once in its original numeric order, using the same zero-based paragraphIndex.
- Each candidates array must contain exactly ${candidateCount} non-empty strings in ${getLanguageEnglishName(targetLanguage)}.
- Never return headings such as "[Paragraph 0]" or "**Paragraph 0:**". Never return a numbered list.
- The following exchanges are format examples only. Follow their JSON structure, but follow the requested languages and content for the real task.`,
			},
			...variantsFewShotMessages(candidateCount),
			{
				role: "user",
				content: `REAL TASK\nTranslate from ${getLanguageEnglishName(sourceLanguage)} to ${getLanguageEnglishName(targetLanguage)}. This is in the context of [${context}].\n\n${paragraphs.map((paragraph, index) => `[Paragraph ${index}]\n${paragraph}`).join("\n\n")}`,
			},
		],
		options: { temperature: 0.8, maxTokens: 8192 },
	});

	const ordered = [...result.paragraphs].sort((a, b) => a.paragraphIndex - b.paragraphIndex);
	if (ordered.some((paragraph, index) => paragraph.paragraphIndex !== index)) throw new Error("The AI response used invalid paragraph indices.");
	const candidates = ordered.map((paragraph) => paragraph.candidates.map((candidate) => candidate.trim()));
	validateTranslationCandidates(candidates, paragraphs.length, candidateCount);
	return candidates;
}

export function translationContentFingerprint(input: {
	referenceParagraphs: string[];
	context: string;
	sourceLanguage: string;
	promptLanguage: string;
}) {
	return createHash("sha256")
		.update(
			JSON.stringify({
				referenceParagraphs: input.referenceParagraphs,
				context: input.context,
				sourceLanguage: input.sourceLanguage,
				promptLanguage: input.promptLanguage,
			}),
		)
		.digest("hex");
}

export async function getOrCreateTranslationSourceSet(input: {
	userId: string;
	templateId: number;
	referenceParagraphs: string[];
	context: string;
	sourceLanguage: string;
	promptLanguage: string;
}) {
	const contentFingerprint = translationContentFingerprint(input);
	const filter = and(
		eq(translationSourceSet.templateId, input.templateId),
		eq(translationSourceSet.promptLanguage, input.promptLanguage),
		eq(translationSourceSet.contentFingerprint, contentFingerprint),
	);
	const [cached] = await db.select().from(translationSourceSet).where(filter).limit(1);
	if (cached) {
		validateTranslationCandidates(cached.candidates, input.referenceParagraphs.length);
		return cached;
	}

	const candidates = await generateTranslationVariants({
		userId: input.userId,
		paragraphs: input.referenceParagraphs,
		sourceLanguage: input.sourceLanguage,
		targetLanguage: input.promptLanguage,
		context: input.context,
	});
	const [inserted] = await db
		.insert(translationSourceSet)
		.values({
			templateId: input.templateId,
			sourceLanguage: input.sourceLanguage,
			promptLanguage: input.promptLanguage,
			referenceParagraphs: input.referenceParagraphs,
			context: input.context,
			contentFingerprint,
			candidates,
		})
		.onConflictDoNothing({
			target: [translationSourceSet.templateId, translationSourceSet.promptLanguage, translationSourceSet.contentFingerprint],
		})
		.returning();
	if (inserted) return inserted;

	const [winner] = await db.select().from(translationSourceSet).where(filter).limit(1);
	if (!winner) throw new Error("Translation source generation lost a race but no winning record was found.");
	validateTranslationCandidates(winner.candidates, input.referenceParagraphs.length);
	return winner;
}

export function chooseInitialCandidate(votes: number[], random = Math.random) {
	if (votes.length !== TRANSLATION_CANDIDATE_COUNT) throw new Error(`Expected ${TRANSLATION_CANDIDATE_COUNT} candidate vote totals.`);
	const total = votes.reduce((sum, value) => sum + value, 0);
	if (total < TRANSLATION_VOTE_THRESHOLD) return Math.min(TRANSLATION_CANDIDATE_COUNT - 1, Math.floor(random() * TRANSLATION_CANDIDATE_COUNT));
	const maximum = Math.max(...votes);
	const tied = votes.flatMap((value, index) => (value === maximum ? [index] : []));
	return tied[Math.min(tied.length - 1, Math.floor(random() * tied.length))];
}

export async function getOrCreateTranslationAttempt(userId: string, sourceSetId: number, paragraphCount: number) {
	if (!Number.isInteger(paragraphCount) || paragraphCount < 1) throw new Error("A translation attempt requires at least one paragraph.");
	const [existing] = await db
		.select({ id: translationAttempt.id })
		.from(translationAttempt)
		.where(
			and(
				eq(translationAttempt.userId, userId),
				eq(translationAttempt.sourceSetId, sourceSetId),
				inArray(translationAttempt.workflowPhase, ["draft", "submitted", "correction", "second_draft", "transfer"]),
			),
		)
		.limit(1);
	if (existing) return existing.id;

	const voteRows = await db
		.select({
			paragraphIndex: translationAnswer.paragraphIndex,
			candidateIndex: translationAnswer.candidateIndex,
			votes: count(),
		})
		.from(translationAnswer)
		.innerJoin(translationAttempt, eq(translationAnswer.attemptId, translationAttempt.id))
		.where(
			and(
				eq(translationAttempt.sourceSetId, sourceSetId),
				inArray(translationAttempt.workflowPhase, ["submitted", "correction", "second_draft", "transfer", "completed"]),
			),
		)
		.groupBy(translationAnswer.paragraphIndex, translationAnswer.candidateIndex);

	const initialIndices = Array.from({ length: paragraphCount }, (_, paragraphIndex) => {
		const votes = Array.from(
			{ length: TRANSLATION_CANDIDATE_COUNT },
			(_, candidateIndex) => voteRows.find((row) => row.paragraphIndex === paragraphIndex && row.candidateIndex === candidateIndex)?.votes ?? 0,
		);
		return chooseInitialCandidate(votes);
	});

	const insertedId = await db.transaction(async (tx) => {
		const [inserted] = await tx
			.insert(translationAttempt)
			.values({ userId, sourceSetId, workflowPhase: "draft" })
			.onConflictDoNothing()
			.returning({ id: translationAttempt.id });
		if (!inserted) return null;
		await tx.insert(translationAnswer).values(
			initialIndices.map((candidateIndex, paragraphIndex) => ({
				attemptId: inserted.id,
				paragraphIndex,
				candidateIndex,
				translation: "",
			})),
		);
		return inserted.id;
	});
	if (insertedId) return insertedId;

	const [winner] = await db
		.select({ id: translationAttempt.id })
		.from(translationAttempt)
		.where(
			and(
				eq(translationAttempt.userId, userId),
				eq(translationAttempt.sourceSetId, sourceSetId),
				inArray(translationAttempt.workflowPhase, ["draft", "submitted", "correction", "second_draft", "transfer"]),
			),
		)
		.limit(1);
	if (!winner) throw new Error("Translation attempt creation lost a race but no winning record was found.");
	return winner.id;
}
