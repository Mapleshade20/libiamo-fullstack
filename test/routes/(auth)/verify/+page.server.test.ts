import { describe, expect, it } from "vitest";
import { load } from "../../../../src/routes/(auth)/verify/+page.server";

describe("Verify page +page.server", () => {
	const createEvent = (query = "") =>
		({
			url: new URL(`https://example.com/verify${query}`),
		}) as any;

	it("returns defaults when query params are missing", async () => {
		const result = await load(createEvent());

		expect(result).toEqual({
			pending: false,
			error: null,
			success: false,
		});
	});

	it("parses pending and success flags from query params", async () => {
		const result = await load(createEvent("?pending=1&success=1"));

		expect(result).toEqual({
			pending: true,
			error: null,
			success: true,
		});
	});

	it("returns error message from query params", async () => {
		const result = await load(createEvent("?error=token_expired"));

		expect(result).toEqual({
			pending: false,
			error: "token_expired",
			success: false,
		});
	});
});
