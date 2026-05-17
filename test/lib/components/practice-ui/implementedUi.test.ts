import { describe, expect, it } from "vitest";
import { IMPLEMENTED_PRACTICE_UIS, isPracticeUiImplemented } from "$lib/components/practice-ui/implementedUi";

describe("implemented practice UI", () => {
	it("includes currently supported chat UIs", () => {
		expect(IMPLEMENTED_PRACTICE_UIS).toEqual(["discord", "imessage", "reddit"]);
	});

	it.each(["discord", "imessage", "reddit"])("returns true for implemented ui: %s", (ui) => {
		expect(isPracticeUiImplemented(ui)).toBe(true);
	});

	it.each(["ao3", "apple_mail", "translator", "", "unknown"])("returns false for non-implemented ui: %s", (ui) => {
		expect(isPracticeUiImplemented(ui)).toBe(false);
	});

	it("returns false for nullish values", () => {
		expect(isPracticeUiImplemented(undefined)).toBe(false);
		expect(isPracticeUiImplemented(null)).toBe(false);
	});
});
