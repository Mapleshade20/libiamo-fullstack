import { afterEach, describe, expect, it, vi } from "vitest";
import { siteOrigin } from "$lib/server/app/site-origin";

const environment = vi.hoisted(() => ({ ORIGIN: "" }));
vi.mock("$env/dynamic/private", () => ({ env: environment }));
afterEach(() => {
	environment.ORIGIN = "";
});

describe("site origin", () => {
	it("uses the configured public origin rather than the request host", () => {
		environment.ORIGIN = "https://libiamo.test/";
		expect(siteOrigin(new URL("http://internal:3000/welcome?preview=1"))).toBe("https://libiamo.test");
	});
	it("falls back to the request origin during local development", () => {
		expect(siteOrigin(new URL("http://localhost:5173/welcome"))).toBe("http://localhost:5173");
	});
});
