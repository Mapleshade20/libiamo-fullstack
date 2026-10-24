import { describe, expect, it } from "vitest";
import { load } from "$routes/+layout.server";

const cookies = { get: () => undefined };
const request = { url: new URL("https://libiamo.test/welcome"), untrack: <T>(read: () => T) => read() };

describe("root +layout.server", () => {
	it("exposes only the viewer name to public route layouts", () => {
		const result = load({
			...request,
			cookies,
			locals: { user: { id: "u1", name: "Alice", email: "alice@example.com", activeLanguage: "es" } },
		} as any) as any;

		expect(result.viewer).toEqual({ name: "Alice" });
		expect(result.viewer).not.toHaveProperty("email");
		expect(result.learnerDocumentLanguage).toBe("es");
	});

	it("omits the viewer for signed-out requests", () => {
		const result = load({ ...request, cookies, locals: {} } as any) as any;

		expect(result).not.toHaveProperty("viewer");
		expect(result.learnerDocumentLanguage).toBe("en");
	});
});
