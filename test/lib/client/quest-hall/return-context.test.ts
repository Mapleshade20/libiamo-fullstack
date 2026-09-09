import { describe, expect, it } from "vitest";
import {
	clearQuestHallReturnContext,
	getQuestHallWorkflowReturnHref,
	QUEST_HALL_RETURN_CONTEXT_STORAGE_KEY,
	type QuestHallReturnStorage,
	restoreQuestHallReturnContext,
	saveQuestHallReturnContext,
	synchronizeQuestHallReturnAccount,
} from "$lib/client/quest-hall/return-context";

class MemoryStorage implements QuestHallReturnStorage {
	values = new Map<string, string>();
	getItem(key: string) {
		return this.values.get(key) ?? null;
	}
	setItem(key: string, value: string) {
		this.values.set(key, value);
	}
	removeItem(key: string) {
		this.values.delete(key);
	}
}

const context = {
	accountScope: "account-a",
	activeLanguage: "fr" as const,
	edition: "2026-09-04",
	origin: "catalog" as const,
	section: "daily" as const,
	spread: 2,
	narrowItemKey: "daily-12" as const,
	selectedKey: "daily-12" as const,
	translationMonth: "2026-09",
	scrollOffset: 420,
	focusTarget: "preparation" as const,
};

function restore(storage: QuestHallReturnStorage, overrides = {}) {
	return restoreQuestHallReturnContext({
		accountScope: "account-a",
		activeLanguage: "fr",
		edition: "2026-09-04",
		translationMonths: new Set(["2026-09"]),
		itemKeys: new Set(["daily-10", "daily-12"]),
		translationItemMonths: new Map(),
		spreadCounts: { daily: 2, weekly: 1, translation: 1 },
		storage,
		...overrides,
	});
}

describe("Quest Hall return context", () => {
	it("restores a valid tab-scoped location and builds its Details href", () => {
		const storage = new MemoryStorage();
		saveQuestHallReturnContext(context, storage);

		expect(restore(storage)).toMatchObject(context);
		expect(
			getQuestHallWorkflowReturnHref({
				destination: "details",
				accountScope: "account-a",
				activeLanguage: "fr",
				edition: "2026-09-04",
				item: { kind: "quest", id: 12 },
				base: "/libiamo",
				fallbackHref: "/libiamo/task/12",
				storage,
			}),
		).toBe("/libiamo/?view=prepare&leaf=2&task=daily-12");
	});

	it("clears the previous context before an account switch can reuse its item", () => {
		const storage = new MemoryStorage();
		synchronizeQuestHallReturnAccount("account-a", storage);
		saveQuestHallReturnContext(context, storage);
		synchronizeQuestHallReturnAccount("account-b", storage);

		expect(storage.getItem(QUEST_HALL_RETURN_CONTEXT_STORAGE_KEY)).toBeNull();
		expect(restore(storage, { accountScope: "account-b" })).toBeNull();
	});

	it("clears both the context and account marker on sign-out", () => {
		const storage = new MemoryStorage();
		synchronizeQuestHallReturnAccount("account-a", storage);
		saveQuestHallReturnContext(context, storage);
		clearQuestHallReturnContext(storage, { clearAccount: true });

		expect(storage.values.size).toBe(0);
	});

	it("rejects version, language, edition, month, spread, and item mismatches", () => {
		const cases: Array<(storage: MemoryStorage) => void> = [
			(storage) => {
				const stored = JSON.parse(storage.getItem(QUEST_HALL_RETURN_CONTEXT_STORAGE_KEY) ?? "{}");
				storage.setItem(QUEST_HALL_RETURN_CONTEXT_STORAGE_KEY, JSON.stringify({ ...stored, version: 2 }));
			},
			(storage) => void restore(storage, { activeLanguage: "es" }),
			(storage) => void restore(storage, { edition: "2026-09-05" }),
			(storage) => void restore(storage, { translationMonths: new Set(["2026-08"]) }),
			(storage) => void restore(storage, { spreadCounts: { daily: 1, weekly: 1, translation: 1 } }),
			(storage) => void restore(storage, { itemKeys: new Set(["daily-10"]) }),
		];

		for (const invalidate of cases) {
			const storage = new MemoryStorage();
			saveQuestHallReturnContext(context, storage);
			invalidate(storage);
			expect(restore(storage)).toBeNull();
			expect(storage.getItem(QUEST_HALL_RETURN_CONTEXT_STORAGE_KEY)).toBeNull();
		}
	});

	it("falls back for an unrelated standalone workflow entry", () => {
		const storage = new MemoryStorage();
		saveQuestHallReturnContext(context, storage);

		expect(
			getQuestHallWorkflowReturnHref({
				destination: "details",
				accountScope: "account-a",
				activeLanguage: "fr",
				edition: "2026-09-04",
				item: { kind: "quest", id: 99 },
				base: "",
				fallbackHref: "/task/99",
				storage,
			}),
		).toBe("/task/99");
	});

	it("returns a legacy month-browser translation through the production root", () => {
		const storage = new MemoryStorage();
		saveQuestHallReturnContext(
			{
				...context,
				origin: "translation-index",
				section: "translation",
				spread: 1,
				narrowItemKey: "translation-31",
				selectedKey: "translation-31",
				translationMonth: "2026-08",
				focusTarget: "translation-item",
			},
			storage,
		);

		expect(
			getQuestHallWorkflowReturnHref({
				destination: "details",
				accountScope: "account-a",
				activeLanguage: "fr",
				edition: "2026-09-04",
				item: { kind: "translation", id: 31 },
				base: "/libiamo",
				fallbackHref: "/libiamo/translate/31",
				storage,
			}),
		).toBe("/libiamo/?return=translation");
		expect(
			restore(storage, {
				translationMonths: new Set(["2026-08", "2026-09"]),
				itemKeys: new Set(["translation-31"]),
				translationItemMonths: new Map([["translation-31", "2026-08"]]),
			}),
		).toMatchObject({ selectedKey: "translation-31", translationMonth: "2026-08" });
	});

	it("keeps an explicit Home destination at the closed Hall root", () => {
		const storage = new MemoryStorage();
		saveQuestHallReturnContext(context, storage);

		expect(
			getQuestHallWorkflowReturnHref({
				destination: "home",
				accountScope: "account-a",
				activeLanguage: "fr",
				edition: "2026-09-04",
				item: { kind: "quest", id: 12 },
				base: "/libiamo",
				fallbackHref: "/libiamo/task/12",
				storage,
			}),
		).toBe("/libiamo/");
		expect(storage.getItem(QUEST_HALL_RETURN_CONTEXT_STORAGE_KEY)).toBeNull();
	});

	it("tolerates unavailable storage", () => {
		const unavailable: QuestHallReturnStorage = {
			getItem() {
				throw new Error("blocked");
			},
			setItem() {
				throw new Error("blocked");
			},
			removeItem() {
				throw new Error("blocked");
			},
		};

		expect(() => saveQuestHallReturnContext(context, unavailable)).not.toThrow();
		expect(restore(unavailable)).toBeNull();
		expect(
			getQuestHallWorkflowReturnHref({
				destination: "details",
				accountScope: "account-a",
				activeLanguage: "fr",
				edition: "2026-09-04",
				item: { kind: "quest", id: 12 },
				base: "",
				fallbackHref: "/task/12",
				storage: unavailable,
			}),
		).toBe("/task/12");
	});
});
