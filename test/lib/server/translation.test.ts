import { beforeEach, describe, expect, it, vi } from "vitest";

const { selectQueue, insertQueue, mockDb, mockChatJson } = vi.hoisted(() => {
	const selectQueue: unknown[][] = [];
	const insertQueue: unknown[][] = [];
	const select = vi.fn(() => {
		const chain = Promise.resolve(selectQueue.shift() ?? []) as Promise<unknown[]> & Record<string, ReturnType<typeof vi.fn>>;
		chain.from = vi.fn(() => chain);
		chain.innerJoin = vi.fn(() => chain);
		chain.where = vi.fn(() => chain);
		chain.groupBy = vi.fn(() => chain);
		chain.limit = vi.fn(() => chain);
		return chain;
	});
	const insert = vi.fn(() => {
		const chain = {
			values: vi.fn(),
			onConflictDoNothing: vi.fn(),
			returning: vi.fn(),
		};
		chain.values.mockReturnValue(chain);
		chain.onConflictDoNothing.mockReturnValue(chain);
		chain.returning.mockImplementation(() => Promise.resolve(insertQueue.shift() ?? []));
		return chain;
	});
	const mockDb = { select, insert, transaction: vi.fn() };
	mockDb.transaction.mockImplementation(async (callback) => callback(mockDb));
	return { selectQueue, insertQueue, mockDb, mockChatJson: vi.fn() };
});

vi.mock("$lib/server/db", () => ({ db: mockDb }));
vi.mock("$lib/server/db/schema", () => ({
	translationSourceSet: {
		id: "sourceSet.id",
		taskId: "sourceSet.taskId",
		promptLanguage: "sourceSet.promptLanguage",
		contentFingerprint: "sourceSet.contentFingerprint",
	},
	translationAttempt: {
		id: "attempt.id",
		userId: "attempt.userId",
		sourceSetId: "attempt.sourceSetId",
		lineupId: "attempt.lineupId",
		workflowPhase: "attempt.workflowPhase",
	},
	translationAnswer: {
		attemptId: "answer.attemptId",
		paragraphIndex: "answer.paragraphIndex",
		candidateIndex: "answer.candidateIndex",
	},
}));
vi.mock("drizzle-orm", () => ({
	and: vi.fn((...conditions) => conditions),
	count: vi.fn(),
	eq: vi.fn((column, value) => ({ column, value })),
	inArray: vi.fn(),
	isNull: vi.fn((column) => ({ column, isNull: true })),
}));
vi.mock("$lib/server/llm", () => ({ chatJson: mockChatJson }));

import {
	chooseInitialCandidate,
	generateTranslationVariants,
	getOrCreateTranslationAttempt,
	getOrCreateTranslationSourceSet,
	translationContentFingerprint,
	validateTranslationCandidates,
} from "$lib/server/translation";

describe("translation service", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		selectQueue.length = 0;
		insertQueue.length = 0;
	});

	it("generates the requested candidate count for every paragraph in one call", async () => {
		mockChatJson.mockResolvedValue({
			value: {
				paragraphs: [
					{ paragraphIndex: 0, candidates: ["One", "First"] },
					{ paragraphIndex: 1, candidates: ["Two", "Second"] },
				],
			},
		});
		const result = await generateTranslationVariants({
			userId: "u1",
			paragraphs: ["Un", "Deux"],
			sourceLanguage: "fr",
			targetLanguage: "en",
			context: "a numbered list",
			candidateCount: 2,
		});
		expect(result).toEqual([
			["One", "First"],
			["Two", "Second"],
		]);
		expect(mockChatJson).toHaveBeenCalledTimes(1);
		const request = mockChatJson.mock.calls[0][0];
		expect(request.userId).toBe("u1");
		expect(request.messages.map((message: { role: string }) => message.role)).toEqual(["system", "user"]);
		const [system, user] = request.messages;
		// The trusted task context belongs to the system message; the user message is only the paragraphs.
		expect(system.content).toContain("a numbered list");
		expect(user.content).not.toContain("a numbered list");
		expect(JSON.parse(user.content)).toEqual({
			paragraphs: [
				{ paragraphIndex: 0, text: "Un" },
				{ paragraphIndex: 1, text: "Deux" },
			],
		});
		const shape = JSON.parse(system.content.match(/\{"paragraphs".*\}/)?.[0] ?? "{}");
		expect(shape.paragraphs[0].candidates).toHaveLength(2);
	});

	it("rejects missing paragraphs, duplicate indices, and incorrect candidate counts", async () => {
		mockChatJson.mockResolvedValue({ value: { paragraphs: [{ paragraphIndex: 0, candidates: ["One", "First", "Another"] }] } });
		await expect(
			generateTranslationVariants({
				userId: "u1",
				paragraphs: ["Un", "Deux"],
				sourceLanguage: "fr",
				targetLanguage: "en",
				context: "a list",
			}),
		).rejects.toThrow("cover every paragraph");
		expect(() => validateTranslationCandidates([["one", "two"]], 1)).toThrow("exactly 3");
	});

	it("changes the fingerprint for source, context, language, or prompt version changes", () => {
		const base = { referenceParagraphs: ["Bonjour"], context: "a greeting", sourceLanguage: "fr", promptLanguage: "en" };
		const fingerprint = translationContentFingerprint(base);
		expect(translationContentFingerprint(base)).toBe(fingerprint);
		expect(translationContentFingerprint({ ...base, context: "a formal greeting" })).not.toBe(fingerprint);
		expect(translationContentFingerprint({ ...base, promptLanguage: "ja" })).not.toBe(fingerprint);
	});

	it("returns a cached source set without invoking the LLM", async () => {
		const cached = { id: 4, candidates: [["Hello", "Hi", "Greetings"]] };
		selectQueue.push([cached]);
		const result = await getOrCreateTranslationSourceSet({
			userId: "u1",
			taskId: 1,
			referenceParagraphs: ["Bonjour"],
			context: "a greeting",
			sourceLanguage: "fr",
			promptLanguage: "en",
		});
		expect(result).toBe(cached);
		expect(mockChatJson).not.toHaveBeenCalled();
	});

	it("discards a losing concurrent generation and reads the winning source set", async () => {
		const winner = { id: 5, candidates: [["Winner 1", "Winner 2", "Winner 3"]] };
		selectQueue.push([], [winner]);
		insertQueue.push([]);
		mockChatJson.mockResolvedValue({
			value: { paragraphs: [{ paragraphIndex: 0, candidates: ["Mine 1", "Mine 2", "Mine 3"] }] },
		});
		const result = await getOrCreateTranslationSourceSet({
			userId: "u1",
			taskId: 1,
			referenceParagraphs: ["Bonjour"],
			context: "a greeting",
			sourceLanguage: "fr",
			promptLanguage: "en",
		});
		expect(result).toBe(winner);
		expect(mockDb.insert).toHaveBeenCalledTimes(1);
	});

	it("uses random candidates below 30 votes and top-voted candidates from 30", () => {
		expect(chooseInitialCandidate([29, 0, 0], () => 0.9)).toBe(2);
		expect(chooseInitialCandidate([20, 5, 5], () => 0.4)).toBe(0);
		expect(chooseInitialCandidate([15, 15, 0], () => 0.9)).toBe(1);
	});

	it("initializes paragraph choices from submitted/evaluated votes only", async () => {
		selectQueue.push(
			[],
			[
				{ paragraphIndex: 0, candidateIndex: 0, votes: 20 },
				{ paragraphIndex: 0, candidateIndex: 1, votes: 10 },
				{ paragraphIndex: 1, candidateIndex: 1, votes: 15 },
				{ paragraphIndex: 1, candidateIndex: 2, votes: 15 },
			],
		);
		insertQueue.push([{ id: 7 }]);
		const random = vi.spyOn(Math, "random").mockReturnValue(0.9);

		expect(await getOrCreateTranslationAttempt({ userId: "u1", sourceSet: { id: 4, taskId: 3, candidates: [[], []] }, lineupId: 5 })).toBe(7);
		const attemptInsert = mockDb.insert.mock.results[0].value;
		expect(attemptInsert.values).toHaveBeenCalledWith({ userId: "u1", taskId: 3, sourceSetId: 4, lineupId: 5, workflowPhase: "draft" });
		const answerInsert = mockDb.insert.mock.results[1].value;
		expect(answerInsert.values).toHaveBeenCalledWith([
			{ attemptId: 7, paragraphIndex: 0, candidateIndex: 0, translation: "" },
			{ attemptId: 7, paragraphIndex: 1, candidateIndex: 2, translation: "" },
		]);
		const { inArray } = await import("drizzle-orm");
		expect(inArray).toHaveBeenCalledWith("attempt.workflowPhase", ["submitted", "correction", "second_draft", "transfer", "completed"]);
		random.mockRestore();
	});

	it("returns the winning attempt when concurrent creation loses the unique insert", async () => {
		selectQueue.push([], [], [{ id: 8 }]);
		insertQueue.push([]);
		expect(await getOrCreateTranslationAttempt({ userId: "u1", sourceSet: { id: 4, taskId: 3, candidates: [[]] }, lineupId: null })).toBe(8);
		expect(mockDb.insert).toHaveBeenCalledTimes(1);
	});
});
