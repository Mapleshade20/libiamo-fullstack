import { describe, expect, it } from "vitest";
import { calculateCurrentTurns, getTurnLimitMessage, isTurnLimitReached } from "$lib/components/utils/sessionUtils";

describe("sessionUtils", () => {
	const mockMessages = [
		{ role: "user", isHidden: true },
		{ role: "user", isHidden: false },
		{ role: "agent", isHidden: false },
		{ role: "user", isHidden: false },
	] as any[];

	it("counts visible user turns", () => {
		expect(calculateCurrentTurns(mockMessages)).toBe(2);
	});

	it("never counts pending or failed agent placeholders as turns", () => {
		const withPlaceholders = [
			{ role: "user", isHidden: false },
			{ role: "agent", isHidden: false, deliveryState: "pending" },
			{ role: "agent", isHidden: false, deliveryState: "failed" },
		] as any[];
		expect(calculateCurrentTurns(withPlaceholders)).toBe(1);
	});

	it("checks turn limits correctly", () => {
		expect(isTurnLimitReached(5, 5)).toBe(true);
		expect(isTurnLimitReached(4, 5)).toBe(false);
		expect(isTurnLimitReached(10, 0)).toBe(false);
	});

	it("returns formatted turn limit message", () => {
		expect(getTurnLimitMessage(10)).toBe("This session has reached the maximum turn limit (10).");
		expect(getTurnLimitMessage(0)).toBe("");
	});
});
