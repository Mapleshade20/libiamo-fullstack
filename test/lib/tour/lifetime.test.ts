import { expect, it } from "vitest";
import { captureTourState, invalidateTourState } from "#lib/components/tour/lifetime.ts";

it("invalidates callbacks on chapter changes and exit, including a real page that preceded the tour", () => {
	const real = captureTourState();
	invalidateTourState();
	const first = captureTourState();
	expect(real()).toBe(false);
	expect(first()).toBe(true);
	invalidateTourState();
	expect(first()).toBe(false);
	const second = captureTourState();
	invalidateTourState();
	expect(second()).toBe(false);
});
