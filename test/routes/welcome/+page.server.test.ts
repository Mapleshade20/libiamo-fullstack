import { describe, expect, it } from "vitest";
import { load } from "$routes/welcome/+page.server";

describe("Welcome +page.server", () => {
	it("renders for signed-out visitors", () => {
		expect(load({ locals: { user: null } } as any)).toBeUndefined();
	});

	it("sends signed-in learners to Quest Hall", () => {
		expect(() => load({ locals: { user: { id: "u1" } } } as any)).toThrowError(expect.objectContaining({ status: 302, location: "/" }));
	});
});
