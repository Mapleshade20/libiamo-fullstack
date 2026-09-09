import { describe, expect, it, vi } from "vitest";
import { handlePreparationActionResult } from "$lib/client/quest-hall/preparation-actions";

describe("embedded preparation actions", () => {
	it("keeps cross-route failures in the preparation pane", async () => {
		const update = vi.fn();
		await expect(
			handlePreparationActionResult({ type: "failure", status: 400, data: { error: "Try again later" } }, update, "Could not complete"),
		).resolves.toBe("Try again later");
		expect(update).not.toHaveBeenCalled();
	});

	it("delegates redirects and successful results to SvelteKit", async () => {
		const update = vi.fn().mockResolvedValue(undefined);
		await expect(
			handlePreparationActionResult({ type: "redirect", status: 303, location: "/translate/2/attempt" }, update, "Could not complete"),
		).resolves.toBeNull();
		expect(update).toHaveBeenCalledWith({ reset: false });
	});

	it("delegates successful and unexpected error results", async () => {
		const update = vi.fn().mockResolvedValue(undefined);
		await expect(handlePreparationActionResult({ type: "success", status: 200, data: {} }, update, "Could not complete")).resolves.toBeNull();
		await expect(
			handlePreparationActionResult({ type: "error", status: 500, error: new Error("Unexpected") }, update, "Could not complete"),
		).resolves.toBeNull();
		expect(update).toHaveBeenCalledTimes(2);
	});
});
