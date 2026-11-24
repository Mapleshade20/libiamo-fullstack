import { afterEach, expect, it, vi } from "vitest";
import { Collector } from "#lib/components/collect/collector.svelte.ts";

const startReading = vi.hoisted(() => vi.fn());
vi.mock("#lib/components/tour/sandbox.svelte.ts", () => ({ sandboxed: () => false, keepCollected: vi.fn() }));
vi.mock("#lib/notebook/notebook.remote.ts", () => ({ removeNotes: vi.fn(async () => {}), startReading }));
vi.mock("#lib/llm/stops.ts", () => ({ needKey: () => {}, answered: async (r: Response) => r.json(), stopOf: () => "error" }));
afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

it("keeps a text as one reading and asks for each highlight once, however slowly the server answers", async () => {
	vi.useFakeTimers();
	let kept = (_: string) => {};
	startReading.mockReturnValue(
		new Promise<string>((r) => {
			kept = r;
		}),
	);
	const fetch = vi.fn(async (_url: string, _init: RequestInit) => Response.json({ items: [] }));
	vi.stubGlobal("fetch", fetch);
	const passage = `I took the bread over to Jo. ${"x".repeat(13_000)}`;
	const collector = new Collector({ lang: "en", native: "zh-CN", feedback: "native" });
	collector.mark("p", passage, "p:1", "took", { sentence: "I took the bread over to Jo.", at: 2 });
	await vi.advanceTimersByTimeAsync(900);
	// The reading is still on its way when a second highlight is filled in.
	collector.mark("p", passage, "p:2", "bread", { sentence: "I took the bread over to Jo.", at: 11 });
	await vi.advanceTimersByTimeAsync(900);
	kept("reading-1");
	await vi.advanceTimersByTimeAsync(0);
	expect(startReading).toHaveBeenCalledOnce();
	expect(startReading.mock.calls[0][0].passage.length).toBe(12_000);
	const sent = fetch.mock.calls.map(([, init]) => JSON.parse(init.body as string));
	expect(sent.map((b) => [b.readingId, b.highlights.map((h: { text: string; at: number }) => [h.text, h.at])])).toEqual([
		["reading-1", [["took", 2]]],
		["reading-1", [["bread", 11]]],
	]);
	collector.dispose();
});
