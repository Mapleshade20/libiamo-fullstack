import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DRAFT_DAYS, DRAFT_LIMIT, dropAllDrafts, dropLocalDraft, keepLocalDraft, localDraft, trimDrafts } from "#lib/client/drafts.ts";

beforeEach(() => {
	const kept = new Map<string, string>();
	vi.stubGlobal("localStorage", {
		getItem: (k: string) => kept.get(k) ?? null,
		setItem: (k: string, v: string) => void kept.set(k, v),
		removeItem: (k: string) => void kept.delete(k),
	});
});
afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

it("keeps a draft per kind and key, and drops it when sent or emptied", () => {
	keepLocalDraft("sheet", "menu|en", "Sopa");
	keepLocalDraft("plan", "menu|en", "Ask about the soup");
	expect(localDraft("sheet", "menu|en")).toBe("Sopa");
	expect(localDraft("plan", "menu|en")).toBe("Ask about the soup");
	dropLocalDraft("sheet", "menu|en");
	expect(localDraft("sheet", "menu|en")).toBe("");
	keepLocalDraft("plan", "menu|en", "  ");
	expect(localDraft("plan", "menu|en")).toBe("");
});

it("cannot pile up: thirty days untouched goes, and only the newest twenty stay", () => {
	vi.useFakeTimers();
	vi.setSystemTime(Date.parse("2026-11-01T00:00:00Z"));
	keepLocalDraft("sheet", "old|en", "old");
	vi.setSystemTime(Date.parse("2026-11-01T00:00:00Z") + DRAFT_DAYS * 86_400_000);
	expect(localDraft("sheet", "old|en")).toBe("");
	for (let i = 0; i < DRAFT_LIMIT + 3; i++) {
		vi.advanceTimersByTime(1000);
		keepLocalDraft("plan", `s${i}|en`, `plan ${i}`);
	}
	expect(localDraft("plan", "s0|en")).toBe("");
	expect(localDraft("plan", `s${DRAFT_LIMIT + 2}|en`)).toBe(`plan ${DRAFT_LIMIT + 2}`);
	const now = Date.now();
	const store = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`plan:${i}`, { text: "x", at: now - i }]));
	expect(Object.keys(trimDrafts(store, now))).toHaveLength(DRAFT_LIMIT);
});

it("empties on signing out", () => {
	keepLocalDraft("mail", "email-landlord", "{}");
	dropAllDrafts();
	expect(localDraft("mail", "email-landlord")).toBe("");
});
