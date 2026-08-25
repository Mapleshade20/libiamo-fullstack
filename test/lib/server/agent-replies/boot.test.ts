import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("$app/environment", () => ({ building: false }));
vi.mock("$lib/server/db", () => ({ db: {} }));

import { readPositiveIntEnv } from "$lib/server/agent-replies/boot";
import { DEFAULT_WORKER_CONCURRENCY } from "$lib/server/agent-replies/worker";

describe("readPositiveIntEnv", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("uses the default when the variable is unset or blank", () => {
		expect(readPositiveIntEnv("X", undefined, 2)).toBe(2);
		expect(readPositiveIntEnv("X", "", 2)).toBe(2);
		expect(readPositiveIntEnv("X", "   ", 2)).toBe(2);
	});

	it("accepts a positive integer", () => {
		expect(readPositiveIntEnv("X", "8", 2)).toBe(8);
		expect(readPositiveIntEnv("X", " 30000 ", 1)).toBe(30_000);
	});

	// A zero concurrency leaves the claim loop's `activeGenerations.size < concurrency`
	// permanently false, so every agent reply stops without a single error surfacing.
	it.each(["0", "-1", "abc", "NaN", "1.5", "1e400"])("falls back to the default for %s", (raw) => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

		expect(readPositiveIntEnv("AGENT_REPLY_WORKER_CONCURRENCY", raw, DEFAULT_WORKER_CONCURRENCY)).toBe(DEFAULT_WORKER_CONCURRENCY);
		expect(warn).toHaveBeenCalledWith(expect.stringContaining("AGENT_REPLY_WORKER_CONCURRENCY"));
	});
});
