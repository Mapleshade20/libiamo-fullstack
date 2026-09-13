import { describe, expect, it } from "vitest";
import { load } from "$routes/+layout.server";

const cookies = { get: () => undefined };

describe("root +layout.server", () => {
	it("exposes only the viewer name to public route layouts", () => {
		const result = load({ cookies, locals: { user: { id: "u1", name: "Alice", email: "alice@example.com" } } } as any) as any;

		expect(result.viewer).toEqual({ name: "Alice" });
		expect(result.viewer).not.toHaveProperty("email");
	});

	it("omits the viewer for signed-out requests", () => {
		const result = load({ cookies, locals: {} } as any) as any;

		expect(result).not.toHaveProperty("viewer");
	});
});
