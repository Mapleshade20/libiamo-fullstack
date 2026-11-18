import { describe, expect, it } from "vitest";
import { keptAlive } from "#lib/server/kept-alive.ts";

const later = <T>(ms: number, v: T) => new Promise<T>((r) => setTimeout(() => r(v), ms));

/** The body as it arrives: each chunk with when it came. */
async function chunks(r: Response) {
	const t0 = Date.now();
	const got: { at: number; text: string }[] = [];
	const reader = (r.body as ReadableStream<Uint8Array>).getReader();
	const text = new TextDecoder();
	for (let c = await reader.read(); !c.done; c = await reader.read()) got.push({ at: Date.now() - t0, text: text.decode(c.value) });
	return got;
}

describe("keptAlive", () => {
	it("sends an answer that comes in time as it is, with its status", async () => {
		const r = await keptAlive(later(5, { body: { error: "no", code: "refused" }, status: 500 }), 100, 20);
		expect(r.status).toBe(500);
		expect(await r.json()).toEqual({ error: "no", code: "refused" });
	});

	it("begins a slow answer at once and keeps bytes going until it comes", async () => {
		const t0 = Date.now();
		const r = await keptAlive(later(400, { body: { done: true } }), 20, 40);
		expect(Date.now() - t0).toBeLessThan(200);
		expect(r.status).toBe(200);
		expect(r.headers.get("content-type")).toBe("application/json");
		const got = await chunks(r);
		const beats = got.filter((c) => c.text === " ");
		// One space at once, then one every beat while the answer is out: no gap near the work's whole length (the timers
		// run late on a busy machine, so the bound is loose).
		expect(beats.length).toBeGreaterThanOrEqual(4);
		for (let i = 1; i < got.length; i++) expect(got[i].at - got[i - 1].at).toBeLessThan(200);
		const all = got.map((c) => c.text).join("");
		expect(JSON.parse(all)).toEqual({ done: true });
	});

	it("says a slow failure in the body, since the status was sent before it was known", async () => {
		const r = await keptAlive(later(50, { body: { error: "provider down", code: "error" }, status: 500 }), 10, 20);
		expect(r.status).toBe(200);
		expect(await r.json()).toEqual({ error: "provider down", code: "error" });
	});

	it("answers work that throws with an error", async () => {
		const r = await keptAlive(Promise.reject(new Error("boom")), 50, 20);
		expect(r.status).toBe(500);
		expect(await r.json()).toEqual({ error: "boom" });
	});
});
