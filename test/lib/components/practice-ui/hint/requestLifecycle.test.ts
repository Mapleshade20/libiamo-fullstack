import { describe, expect, it } from "vitest";
import { createHintRequestLifecycle } from "$lib/components/practice-ui/hint/requestLifecycle";

describe("hint request lifecycle", () => {
	it("invalidates the previous request when a newer request begins", () => {
		const lifecycle = createHintRequestLifecycle();
		const first = lifecycle.begin("content");
		const second = lifecycle.begin("expression");

		expect(lifecycle.isCurrent(first)).toBe(false);
		expect(lifecycle.isCurrent(second)).toBe(true);
	});

	it("invalidates the current request", () => {
		const lifecycle = createHintRequestLifecycle();
		const request = lifecycle.begin("content");

		lifecycle.invalidate();

		expect(lifecycle.isCurrent(request)).toBe(false);
	});
});
