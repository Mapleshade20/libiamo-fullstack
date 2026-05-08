import { beforeEach, describe, expect, it } from "vitest";
import { updateMessageById } from "$lib/components/practice-ui/chatMessages";
import { retryManager } from "$lib/components/practice-ui/retryManager";

describe("messageManager", () => {
	describe("updateMessageById", () => {
		it("updates specific message by ID immutably", () => {
			const messages = [
				{ id: "1", text: "Old A" },
				{ id: "2", text: "Old B" },
			] as any[];

			const updated = updateMessageById(messages, "2", (m) => ({ ...m, text: "New B" }));

			expect(updated[0].text).toBe("Old A");
			expect(updated[1].text).toBe("New B");
			expect(updated).not.toBe(messages);
		});

		it("returns new array even when no message matches", () => {
			const messages = [
				{ id: "1", text: "A" },
				{ id: "2", text: "B" },
			] as any[];

			const updated = updateMessageById(messages, "999", (m) => ({ ...m, text: "Updated" }));

			expect(updated).toEqual(messages);
			expect(updated).not.toBe(messages);
		});

		it("updates all fields using updater function", () => {
			const messages = [{ id: "1", text: "Original", role: "user" }] as any[];

			const updated = updateMessageById(messages, "1", (m) => ({
				...m,
				text: "Updated",
				role: "agent",
				extra: "field",
			}));

			expect(updated[0]).toMatchObject({
				id: "1",
				text: "Updated",
				role: "agent",
				extra: "field",
			});
		});

		it("handles empty message array", () => {
			const updated = updateMessageById([], "1", (m) => ({ ...m, text: "Updated" }));

			expect(updated).toEqual([]);
		});

		it("updates first message correctly", () => {
			const messages = [
				{ id: "first", text: "First message" },
				{ id: "second", text: "Second message" },
			] as any[];

			const updated = updateMessageById(messages, "first", (m) => ({ ...m, text: "Updated first" }));

			expect(updated[0].text).toBe("Updated first");
			expect(updated[1].text).toBe("Second message");
		});

		it("updates last message correctly", () => {
			const messages = [
				{ id: "first", text: "First message" },
				{ id: "last", text: "Last message" },
			] as any[];

			const updated = updateMessageById(messages, "last", (m) => ({ ...m, text: "Updated last" }));

			expect(updated[0].text).toBe("First message");
			expect(updated[1].text).toBe("Updated last");
		});
	});

	describe("retryManager", () => {
		beforeEach(() => {
			// Clear any pending retries before each test
			retryManager.clear("test-msg-1");
			retryManager.clear("test-msg-2");
			retryManager.clear("test-msg-3");
		});

		it("resolves retry promise when resolveRetry is called", async () => {
			const waitForRetry = retryManager.waitForRetry("test-msg-1");

			// Resolve the retry
			const resolved = retryManager.resolveRetry("test-msg-1");

			expect(resolved).toBe(true);

			// Wait for the promise to resolve
			await waitForRetry;
		});

		it("returns false when resolving non-existent message", () => {
			const resolved = retryManager.resolveRetry("non-existent");

			expect(resolved).toBe(false);
		});

		it("clears pending retry", async () => {
			const _waitForRetry = retryManager.waitForRetry("test-msg-2");

			// Clear the retry
			retryManager.clear("test-msg-2");

			// Try to resolve - should return false since it was cleared
			const resolved = retryManager.resolveRetry("test-msg-2");
			expect(resolved).toBe(false);
		});

		it("handles multiple concurrent retry promises", async () => {
			const promise1 = retryManager.waitForRetry("test-msg-1");
			const promise2 = retryManager.waitForRetry("test-msg-2");
			const promise3 = retryManager.waitForRetry("test-msg-3");

			// Resolve them in different order
			expect(retryManager.resolveRetry("test-msg-2")).toBe(true);
			expect(retryManager.resolveRetry("test-msg-1")).toBe(true);
			expect(retryManager.resolveRetry("test-msg-3")).toBe(true);

			// All promises should resolve
			await Promise.all([promise1, promise2, promise3]);
		});

		it("allows retry after clear", async () => {
			// First retry
			const promise1 = retryManager.waitForRetry("test-msg-1");
			expect(retryManager.resolveRetry("test-msg-1")).toBe(true);
			await promise1;

			// Clear and start new retry
			retryManager.clear("test-msg-1");

			const promise2 = retryManager.waitForRetry("test-msg-1");
			expect(retryManager.resolveRetry("test-msg-1")).toBe(true);
			await promise2;
		});

		it("handles resolveRetry called before waitForRetry", () => {
			// Try to resolve before any waitForRetry call
			const resolved = retryManager.resolveRetry("test-msg-1");
			expect(resolved).toBe(false);

			// Now call waitForRetry and resolve properly
			const promise = retryManager.waitForRetry("test-msg-1");
			expect(retryManager.resolveRetry("test-msg-1")).toBe(true);
			return promise;
		});

		it("clears non-existent message without error", () => {
			expect(() => retryManager.clear("non-existent")).not.toThrow();
		});
	});
});
