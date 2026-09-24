import { createHash } from "node:crypto";
import { and, count, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { getLanguageEnglishName, TRANSLATION_CANDIDATE_COUNT } from "$lib/constants";
import { db } from "$lib/server/db";
import { translationAnswer, translationAttempt, translationSourceSet } from "$lib/server/db/schema";
import { type ChatMessage, chatJson } from "$lib/server/llm";

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

/**
 * Source candidates translate the authentic reference paragraphs into the learner's prompt
 * language. The task's translation context is trusted and stable, so it sits in the system
 * message; the paragraphs are the per-call input.
 */
export function buildTranslationVariantsMessages(input: {
	paragraphs: string[];
	sourceLanguage: string;
	targetLanguage: string;
	context: string;
	candidateCount: number;
}): ChatMessage[] {
	const source = getLanguageEnglishName(input.sourceLanguage);
	const target = getLanguageEnglishName(input.targetLanguage);
	const count = input.candidateCount;
	const shape = JSON.stringify({
		paragraphs: [{ paragraphIndex: 0, candidates: Array.from({ length: count }, (_, index) => `<${target} candidate ${index + 1}>`) }],
	});
	return [
		{
			role: "system",
			content: `You are a literary and pragmatic translator. Translate each ${source} paragraph in the user message into ${target}, giving exactly ${count} natural alternatives per paragraph. Preserve meaning, register, voice, and paragraph boundaries; vary the phrasing without adding facts. The text comes from: ${input.context.trim()}

Return only one JSON object, with no Markdown fences or explanation, in this shape:
${shape}
Include every input paragraphIndex exactly once, in order, each with exactly ${count} non-empty ${target} candidates.`,
		},
		{ role: "user", content: JSON.stringify({ paragraphs: input.paragraphs.map((text, paragraphIndex) => ({ paragraphIndex, text })) }) },
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
	const { value: result } = await chatJson({
		schema: VariantsSchema,
		userId,
		messages: buildTranslationVariantsMessages({ paragraphs, sourceLanguage, targetLanguage, context, candidateCount }),
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
	taskId: number;
	referenceParagraphs: string[];
	context: string;
	sourceLanguage: string;
	promptLanguage: string;
}) {
	const contentFingerprint = translationContentFingerprint(input);
	const filter = and(
		eq(translationSourceSet.taskId, input.taskId),
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
			taskId: input.taskId,
			sourceLanguage: input.sourceLanguage,
			promptLanguage: input.promptLanguage,
			referenceParagraphs: input.referenceParagraphs,
			context: input.context,
			contentFingerprint,
			candidates,
		})
		.onConflictDoNothing({
			target: [translationSourceSet.taskId, translationSourceSet.promptLanguage, translationSourceSet.contentFingerprint],
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

/** The learner's unfinished attempt for a source set within one lineup entry, created when missing. */
export async function getOrCreateTranslationAttempt(input: {
	userId: string;
	sourceSet: { id: number; taskId: number; candidates: string[][] };
	lineupId: number | null;
}) {
	const { userId, sourceSet, lineupId } = input;
	const sourceSetId = sourceSet.id;
	const paragraphCount = sourceSet.candidates.length;
	if (!Number.isInteger(paragraphCount) || paragraphCount < 1) throw new Error("A translation attempt requires at least one paragraph.");
	const activeAttempt = and(
		eq(translationAttempt.userId, userId),
		eq(translationAttempt.sourceSetId, sourceSetId),
		lineupId === null ? isNull(translationAttempt.lineupId) : eq(translationAttempt.lineupId, lineupId),
		inArray(translationAttempt.workflowPhase, ["draft", "submitted", "correction", "second_draft", "transfer"]),
	);
	const [existing] = await db.select({ id: translationAttempt.id }).from(translationAttempt).where(activeAttempt).limit(1);
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
			.values({ userId, taskId: sourceSet.taskId, sourceSetId, lineupId, workflowPhase: "draft" })
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

	const [winner] = await db.select({ id: translationAttempt.id }).from(translationAttempt).where(activeAttempt).limit(1);
	if (!winner) throw new Error("Translation attempt creation lost a race but no winning record was found.");
	return winner.id;
}
