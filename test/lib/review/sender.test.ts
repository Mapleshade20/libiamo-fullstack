import { expect, it, vi } from "vitest";
import { ratingSender } from "#lib/review/sender.ts";

it("pauses on failure and retries the same job before later ratings", async () => {
	const send = vi.fn<(job: string) => Promise<void>>().mockRejectedValueOnce(new Error("lost response")).mockResolvedValue(undefined);
	const queue = ratingSender(send, () => {});
	queue.enqueue("request-a");
	queue.enqueue("request-b");
	await vi.waitFor(() => expect(queue.failed).toBe(true));
	expect(send.mock.calls).toEqual([["request-a"]]);
	queue.retry();
	await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(3));
	expect(send.mock.calls).toEqual([["request-a"], ["request-a"], ["request-b"]]);
	expect(queue.failed).toBe(false);
});
