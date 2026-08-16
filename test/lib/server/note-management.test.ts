import { beforeEach, describe, expect, it, vi } from "vitest";
import { createNewCard, State, serializeCard } from "$lib/server/review";

const { mockSelect } = vi.hoisted(() => ({ mockSelect: vi.fn() }));

vi.mock("$lib/server/db", () => ({ db: { select: mockSelect } }));

import { browseManagedNotes, toManagedNote } from "$lib/server/note-management";

beforeEach(() => {
	vi.clearAllMocks();
	mockSelect.mockReset();
});

describe("toManagedNote", () => {
	it("maps content, examples, source, and FSRS metadata for the browser", () => {
		const card = createNewCard();
		card.state = State.Review;
		card.due = new Date("2026-04-20T12:00:00Z");
		card.reps = 5;
		card.lapses = 2;
		const managed = toManagedNote({
			id: 3,
			userId: "u1",
			language: "fr",
			sourceSessionId: null,
			sourceTranslationAttemptId: 9,
			vocab: "prendre une décision",
			targetDefinition: "choisir quoi faire",
			nativeDefinition: "make a decision",
			examples: Array.from({ length: 4 }, (_, index) => ({ targetText: `target ${index}`, nativeText: `native ${index}` })),
			fsrsCard: serializeCard(card),
			createdAt: new Date("2026-04-01T00:00:00Z"),
			updatedAt: new Date("2026-04-02T00:00:00Z"),
		});

		expect(managed).toMatchObject({
			id: 3,
			language: "fr",
			queueKind: "review",
			due: "2026-04-20T12:00:00.000Z",
			reps: 5,
			lapses: 2,
			sourceType: "translation",
		});
		expect(managed.examples).toHaveLength(4);
		expect(managed.examples[0]).toEqual({ targetText: "target 0", nativeText: "native 0" });
	});
});

describe("browseManagedNotes", () => {
	function mockBrowseQueries(selectedRows: unknown[] = []) {
		const offset = vi.fn().mockResolvedValue([]);
		const limit = vi.fn(() => ({ offset }));
		const orderBy = vi.fn(() => ({ limit }));
		const selectedLimit = vi.fn().mockResolvedValue(selectedRows);
		mockSelect
			.mockReturnValueOnce({ from: () => ({ where: () => ({ orderBy }) }) })
			.mockReturnValueOnce({ from: () => ({ where: vi.fn().mockResolvedValue([{ count: 0 }]) }) })
			.mockReturnValueOnce({ from: () => ({ where: () => ({ limit: selectedLimit }) }) });
		return orderBy;
	}

	it("does not emit a positional ORDER BY expression without a selected Note", async () => {
		const orderBy = mockBrowseQueries();
		await browseManagedNotes("u1", { search: "", language: "all", queue: "all", source: "all", page: 1 });
		expect(orderBy).toHaveBeenCalledOnce();
		expect(orderBy.mock.calls[0]).toHaveLength(2);
	});

	it("loads a selected Note separately without changing page ordering", async () => {
		const orderBy = mockBrowseQueries();
		await browseManagedNotes("u1", { search: "", language: "all", queue: "all", source: "all", page: 1, selectedNoteId: 27 });
		expect(orderBy.mock.calls[0]).toHaveLength(2);
		expect(mockSelect).toHaveBeenCalledTimes(3);
	});
});
