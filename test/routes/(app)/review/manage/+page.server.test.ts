import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockBrowse, mockToManaged, mockUpdate, mockDelete, mockSetDue, mockReset } = vi.hoisted(() => ({
	mockBrowse: vi.fn(),
	mockToManaged: vi.fn((note) => note),
	mockUpdate: vi.fn(),
	mockDelete: vi.fn(),
	mockSetDue: vi.fn(),
	mockReset: vi.fn(),
}));

vi.mock("$lib/server/note-management", () => ({
	browseManagedNotes: mockBrowse,
	toManagedNote: mockToManaged,
	MANAGED_NOTES_PAGE_SIZE: 50,
}));
vi.mock("$lib/server/note", () => ({ updateNote: mockUpdate, deleteNote: mockDelete }));
vi.mock("$lib/server/review", () => ({ setNoteDueInDays: mockSetDue, resetNoteScheduling: mockReset }));

import { actions, load } from "$routes/(app)/review/manage/+page.server";

const user = { id: "u1", activeLanguage: "en" };

function loadEvent(query = "") {
	return { locals: { user }, url: new URL(`https://example.com/review/manage${query}`) } as never;
}

function actionEvent(values: Record<string, string>, currentUser: typeof user | null = user) {
	const formData = new FormData();
	for (const [key, value] of Object.entries(values)) formData.set(key, value);
	return { locals: { user: currentUser }, request: { formData: vi.fn().mockResolvedValue(formData) } } as any;
}

const examples = Array.from({ length: 4 }, (_, index) => ({ targetText: `target ${index}`, nativeText: `native ${index}` }));

describe("review/manage page server", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockBrowse.mockResolvedValue({ notes: [{ id: 1 }], total: 51 });
	});

	it("loads mixed-language cards with normalized search filters", async () => {
		const result = (await load(loadEvent("?q=%20decision%20&language=fr&queue=review&source=translation&page=2&note=37"))) as any;
		expect(mockBrowse).toHaveBeenCalledWith("u1", {
			search: "decision",
			language: "fr",
			queue: "review",
			source: "translation",
			page: 2,
			selectedNoteId: 37,
		});
		expect(result).toMatchObject({ total: 51, pageSize: 50, totalPages: 2 });
	});

	it("requires authentication before browsing or mutating", async () => {
		await expect(load({ locals: { user: null }, url: new URL("https://example.com/review/manage") } as never)).rejects.toMatchObject({
			status: 302,
			location: "/sign-in",
		});
		const event = actionEvent({ noteId: "1" }, null);
		await expect(actions.delete(event)).rejects.toMatchObject({ status: 302, location: "/sign-in" });
		expect(event.request.formData).not.toHaveBeenCalled();
	});

	it("updates all editable Note fields and examples", async () => {
		const updated = { id: 4, language: "ja", vocab: "決める", examples };
		mockUpdate.mockResolvedValue(updated);
		const result = await actions.update(
			actionEvent({
				noteId: "4",
				language: "ja",
				vocab: " 決める ",
				targetDefinition: "選択する",
				nativeDefinition: "to decide",
				examples: JSON.stringify(examples),
			}),
		);
		expect(mockUpdate).toHaveBeenCalledWith(4, "u1", {
			language: "ja",
			vocab: "決める",
			targetDefinition: "選択する",
			nativeDefinition: "to decide",
			examples,
		});
		expect(result).toEqual({ success: true, note: updated });
	});

	it("sets due by an integer day offset", async () => {
		mockSetDue.mockResolvedValue({ due: "2026-04-20T00:00:00.000Z", queueKind: "review" });
		const result = await actions.setDue(actionEvent({ noteId: "4", days: "12" }));
		expect(mockSetDue).toHaveBeenCalledWith(4, "u1", 12);
		expect(result).toMatchObject({ success: true, scheduling: { queueKind: "review" } });
	});

	it("resets scheduling and deletes cards through owned services", async () => {
		mockReset.mockResolvedValue({ due: "2026-04-20T00:00:00.000Z", queueKind: "new", reps: 0, lapses: 0 });
		mockDelete.mockResolvedValue({ id: 4 });
		expect(await actions.reset(actionEvent({ noteId: "4" }))).toMatchObject({ success: true, scheduling: { queueKind: "new" } });
		expect(await actions.delete(actionEvent({ noteId: "4" }))).toEqual({ success: true, noteId: 4 });
		expect(mockReset).toHaveBeenCalledWith(4, "u1");
		expect(mockDelete).toHaveBeenCalledWith(4, "u1");
	});

	it("rejects malformed examples before updating", async () => {
		const result = await actions.update(
			actionEvent({
				noteId: "4",
				language: "en",
				vocab: "decide",
				targetDefinition: "choose",
				nativeDefinition: "choose",
				examples: JSON.stringify(examples.slice(0, 3)),
			}),
		);
		expect(result).toMatchObject({ status: 400 });
		expect(mockUpdate).not.toHaveBeenCalled();
	});
});
