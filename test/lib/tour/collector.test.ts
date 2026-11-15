import { afterEach, expect, it, vi } from "vitest";
import { Collector } from "#lib/components/collect/collector.svelte.ts";
import { invalidateTourState } from "#lib/components/tour/lifetime.ts";

const saved = vi.hoisted(() => vi.fn());
vi.mock("#lib/components/tour/sandbox.svelte.ts", () => ({ sandboxed: () => true, keepCollected: saved }));
vi.mock("#lib/notebook/notebook.remote.ts", () => ({ removeNotes: vi.fn() }));
vi.mock("#lib/llm/stops.ts", () => ({ needKey: () => {}, answered: async (r: Response) => r, stopOf: () => "error" }));
afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
	saved.mockClear();
});

it("does not send a delayed tour highlight after exit or disposal", async () => {
	vi.useFakeTimers();
	const fetch = vi.fn();
	vi.stubGlobal("fetch", fetch);
	for (const stop of [invalidateTourState, (collector: Collector) => collector.dispose()]) {
		const collector = new Collector({ lang: "en", native: "zh-CN", feedback: "native" });
		collector.mark("reading", "A phrase.", "reading:1", "phrase", "A phrase.");
		stop(collector);
		await vi.advanceTimersByTimeAsync(1000);
	}
	expect(fetch).not.toHaveBeenCalled();
});

it("cannot file an old chapter's response in a new sandbox", async () => {
	vi.useFakeTimers();
	let release = (_: Response) => {};
	vi.stubGlobal(
		"fetch",
		vi.fn(
			() =>
				new Promise<Response>((resolve) => {
					release = resolve;
				}),
		),
	);
	const collector = new Collector({ lang: "en", native: "zh-CN", feedback: "native" });
	collector.mark("reading", "A phrase.", "reading:1", "phrase", "A phrase.");
	await vi.advanceTimersByTimeAsync(900);
	expect(fetch).toHaveBeenCalledOnce();
	invalidateTourState();
	release(Response.json({ items: [{ n: 1, phrase: "phrase", meaning: "meaning", register: "neutral", why: "", example: "example" }] }));
	await vi.advanceTimersByTimeAsync(0);
	expect(saved).not.toHaveBeenCalled();
	expect(collector.kept[0].phrase).toBeUndefined();
	collector.dispose();
});
