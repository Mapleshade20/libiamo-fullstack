import { describe, expect, it } from "vitest";
import { calculateCurrentTurns, getTurnLimitMessage, isTurnLimitReached } from "$lib/components/utils/sessionUtils";

describe("sessionUtils", () => {
	const mockMessages = [
		{ role: "user", isHidden: true },
		{ role: "user", isHidden: false },
		{ role: "agent", isHidden: false },
		{ role: "user", isHidden: false },
	] as any[];

	it("calculates turns correctly when agentStartsFirst is true", () => {
		expect(calculateCurrentTurns(mockMessages, true)).toBe(2);
	});

	it("calculates turns correctly when agentStartsFirst is false", () => {
		expect(calculateCurrentTurns(mockMessages, false)).toBe(1);
	});

	it("checks turn limits correctly", () => {
		expect(isTurnLimitReached(5, 5)).toBe(true);
		expect(isTurnLimitReached(4, 5)).toBe(false);
		expect(isTurnLimitReached(10, 0)).toBe(false);
	});

	it("returns formatted turn limit message", () => {
		expect(getTurnLimitMessage(10)).toContain("10");
	});
});
