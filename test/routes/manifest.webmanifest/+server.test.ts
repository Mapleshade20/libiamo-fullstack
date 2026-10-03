import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

const paths = vi.hoisted(() => ({ base: "" }));
vi.mock("$app/paths", () => paths);

import { GET, prerender } from "../../../src/routes/manifest.webmanifest/+server";

describe("public installation manifest", () => {
	it.each(["", "/se-projects/libiamo"])("keeps identity, launch and icon URLs inside base '%s'", async (base) => {
		paths.base = base;
		const response = GET();
		const manifest = await response.json();
		expect(prerender).toBe(true);
		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toBe("application/manifest+json");
		expect(manifest).toMatchObject({ id: `${base}/`, start_url: `${base}/`, scope: `${base}/`, display: "standalone" });
		expect(manifest.name).toBeTruthy();
		expect(manifest.short_name).toBeTruthy();
		expect(manifest.icons.filter((icon: { purpose: string }) => icon.purpose === "any").map((icon: { sizes: string }) => icon.sizes)).toEqual([
			"192x192",
			"512x512",
		]);
		expect(manifest.icons.filter((icon: { purpose: string }) => icon.purpose === "maskable")).toHaveLength(1);
		for (const icon of manifest.icons) {
			expect(icon.src.startsWith(`${base}/brand/`)).toBe(true);
			expect(icon.type).toBe("image/png");
			const png = readFileSync(`static${icon.src.slice(base.length)}`);
			expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
			expect(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`).toBe(icon.sizes);
		}
	});
});
