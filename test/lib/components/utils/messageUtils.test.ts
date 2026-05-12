import { describe, expect, it } from "vitest";
import { formatTime, normalizeText } from "$lib/components/utils/messageUtils";

describe("messageUtils", () => {
	it("formats time to HH:MM format", () => {
		const date = new Date("2026-05-08T14:05:00");
		expect(formatTime(date)).toMatch(/\d{1,2}:\d{2}/);
	});

	it("normalizes text with fallback", () => {
		expect(normalizeText("  Valid Text  ", "Fallback")).toBe("Valid Text");
		expect(normalizeText("", "Fallback")).toBe("Fallback");
		expect(normalizeText(null, "Fallback")).toBe("Fallback");
	});
});
