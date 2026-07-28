import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetTemplate, mockFindAttempt, mockAbandon, mockGetSourceSet, mockGetAttempt } = vi.hoisted(() => ({
	mockGetTemplate: vi.fn(),
	mockFindAttempt: vi.fn(),
	mockAbandon: vi.fn(),
	mockGetSourceSet: vi.fn(),
	mockGetAttempt: vi.fn(),
}));

vi.mock("$lib/server/translation-workflow", () => ({
	TranslationWorkflowError: class TranslationWorkflowError extends Error {
		constructor(
			public status: number,
			message: string,
		) {
			super(message);
		}
	},
	abandonTranslationAttempt: mockAbandon,
	findTranslationAttempt: mockFindAttempt,
	getTranslationTemplate: mockGetTemplate,
}));
vi.mock("$lib/server/translation", () => ({
	getOrCreateTranslationSourceSet: mockGetSourceSet,
	getOrCreateTranslationAttempt: mockGetAttempt,
}));
vi.mock("$lib/server/llm", () => ({
	llmErrorMessage: (cause: unknown) => (cause instanceof Error ? cause.message : "AI request failed"),
	llmErrorStatus: () => 500,
}));

import { actions, load } from "$routes/(app)/translate/[id]/+page.server";

const template = {
	id: 1,
	title: "A Letter",
	language: "fr",
	translationReference: ["Bonjour tout le monde."],
	context: "a warm note",
};

function event(user: Record<string, unknown> | null = { id: "u1", activeLanguage: "fr", nativeLanguage: "en" }, id = "1") {
	return { locals: { user }, params: { id }, request: { formData: async () => new FormData() } } as never;
}

describe("translation detail page", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGetTemplate.mockResolvedValue(template);
		mockFindAttempt.mockResolvedValue(null);
		mockGetSourceSet.mockResolvedValue({ id: 4, candidates: [["Hello", "Hi", "Greetings"]] });
		mockGetAttempt.mockResolvedValue(9);
	});

	it("redirects unauthenticated users and rejects invalid template IDs", async () => {
		await expect(load(event(null))).rejects.toMatchObject({ status: 302, location: "/sign-in" });
		await expect(load(event(undefined, "bad"))).rejects.toMatchObject({ status: 404 });
	});

	it("reports native-language blockers without creating an attempt", async () => {
		const missing = (await load(event({ id: "u1", activeLanguage: "fr", nativeLanguage: null }))) as any;
		expect(missing.blockedReason).toBe("missing-native-language");
		const same = (await load(event({ id: "u1", activeLanguage: "fr", nativeLanguage: "fr" }))) as any;
		expect(same.blockedReason).toBe("same-language");
		expect(mockFindAttempt).not.toHaveBeenCalled();
	});

	it("returns only the resumable attempt identity and phase", async () => {
		mockFindAttempt.mockResolvedValue({ id: 9, workflowPhase: "second_draft" });
		const result = (await load(event())) as any;
		expect(result.attempt).toEqual({ id: 9, workflowPhase: "second_draft" });
	});

	it("starts by snapshotting candidates and redirects to the draft route", async () => {
		await expect(actions.start(event())).rejects.toMatchObject({ status: 303, location: "/translate/1/attempt" });
		expect(mockGetSourceSet).toHaveBeenCalledWith({
			templateId: 1,
			referenceParagraphs: template.translationReference,
			context: template.context,
			sourceLanguage: "fr",
			promptLanguage: "en",
		});
		expect(mockGetAttempt).toHaveBeenCalledWith("u1", 4, 1);
	});

	it("abandons an unfinished attempt before a retake", async () => {
		const existing = { id: 9, workflowPhase: "transfer" };
		mockFindAttempt.mockResolvedValue(existing);
		await expect(actions.retake(event())).rejects.toMatchObject({ status: 303, location: "/translate/1/attempt" });
		expect(mockAbandon).toHaveBeenCalledWith(existing);
		expect(mockAbandon.mock.invocationCallOrder[0]).toBeLessThan(mockGetSourceSet.mock.invocationCallOrder[0]);
	});
});
