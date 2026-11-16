import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import meta from "#lib/assets/backdrops/meta.json";
import { PAINTINGS, PRINTS } from "#lib/server/backdrop/pictures.ts";
import { ofDay, picturesOf } from "#lib/server/backdrop/today.ts";

const all = [...PRINTS, ...PAINTINGS];
const metas = meta as Record<string, { width: number; height: number; color: string; licence: string }>;

describe("backdrop pictures", () => {
	it("are all downloaded, public domain or CC0, and nothing else is kept", () => {
		expect(new Set(all.map((p) => p.id)).size).toBe(all.length);
		for (const { id } of all) {
			expect(metas[id], id).toBeDefined();
			expect(metas[id].licence).toMatch(/^(public domain|pd\b|pd-|cc0)/i);
			for (const w of [1600, 800]) expect(existsSync(`src/lib/assets/backdrops/${id}-${w}.webp`), `${id}-${w}`).toBe(true);
		}
		expect(Object.keys(metas).sort()).toEqual(all.map((p) => p.id).sort());
	});

	it("change every day and walk the whole series", () => {
		const list = [0, 1, 2, 3, 4, 5, 6];
		const days = Array.from({ length: 7 }, (_, i) => `2026-11-${String(10 + i).padStart(2, "0")}`);
		const picked = days.map((d) => ofDay(list, d));
		expect(new Set(picked).size).toBe(7);
		for (const series of [PRINTS, PAINTINGS] as (readonly { id: string }[])[]) {
			const seen = new Set(
				Array.from({ length: series.length }, (_, i) => ofDay(series, new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10))),
			);
			expect(seen.size).toBe(series.length);
		}
	});

	it("follow the learner's day, not the server's", () => {
		// 20:00 UTC on 15 November is already the 16th in Shanghai.
		const at = Date.UTC(2026, 10, 15, 20);
		const shanghai = picturesOf(at, "Asia/Shanghai");
		expect(shanghai).toEqual(picturesOf(Date.UTC(2026, 10, 16, 3), "UTC"));
		expect(shanghai.image.src).not.toBe(picturesOf(at, "UTC").image.src);
	});

	it("hand the page only the day's two pictures, with both sizes", () => {
		const { image, painting } = picturesOf(Date.UTC(2026, 10, 15), "UTC");
		expect(image.kind).toBe("image");
		expect(painting.kind).toBe("painting");
		for (const p of [image, painting]) {
			expect(p.srcset.split(", ")).toHaveLength(2);
			expect(p.srcset).toContain(p.src);
			expect(p.color).toMatch(/^#[0-9a-f]{6}$/);
		}
	});
});
