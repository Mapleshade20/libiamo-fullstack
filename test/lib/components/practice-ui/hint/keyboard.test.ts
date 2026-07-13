import { describe, expect, it } from "vitest";
import { isImeKeyboardEvent } from "$lib/components/practice-ui/hint/keyboard";

describe("hint keyboard composition handling", () => {
	it("ignores keyboard shortcuts while an IME composition is active", () => {
		expect(isImeKeyboardEvent({ isComposing: true, keyCode: 27 })).toBe(true);
	});

	it("recognizes the IME fallback keyCode at composition boundaries", () => {
		expect(isImeKeyboardEvent({ isComposing: false, keyCode: 229 })).toBe(true);
	});

	it("allows ordinary keyboard shortcuts outside IME composition", () => {
		expect(isImeKeyboardEvent({ isComposing: false, keyCode: 27 })).toBe(false);
	});
});
