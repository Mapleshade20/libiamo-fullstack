import { describe, expect, it, vi } from "vitest";
import { singleFlight } from "$lib/server/llm/single-flight";

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

describe("singleFlight", () => {
	it("shares a running call's result with requests for the same key", async () => {
		const run = deferred<string>();
		const work = vi.fn(() => run.promise);

		const first = singleFlight("same", work);
		const second = singleFlight("same", work);
		run.resolve("done");

		await expect(Promise.all([first, second])).resolves.toEqual(["done", "done"]);
		expect(work).toHaveBeenCalledTimes(1);
	});

	it("shares a failure, then runs again once the call has settled", async () => {
		const run = deferred<string>();
		const first = singleFlight("failing", () => run.promise);
		const second = singleFlight("failing", () => Promise.resolve("unused"));
		run.reject(new Error("provider down"));

		await expect(first).rejects.toThrow("provider down");
		await expect(second).rejects.toThrow("provider down");
		await expect(singleFlight("failing", () => Promise.resolve("retried"))).resolves.toBe("retried");
	});

	it("runs different keys independently", async () => {
		const work = vi.fn(async (value: string) => value);

		await expect(Promise.all([singleFlight("a", () => work("a")), singleFlight("b", () => work("b"))])).resolves.toEqual(["a", "b"]);
		expect(work).toHaveBeenCalledTimes(2);
	});
});
