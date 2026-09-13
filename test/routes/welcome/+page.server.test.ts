import { describe, expect, it } from "vitest";
import { load } from "$routes/welcome/+page.server";

describe("Welcome +page.server", () => {
	it.each([null, { id: "u1" }])("renders without redirecting for viewer %j", (user) => {
		expect(load({ locals: { user } } as any)).toEqual({});
	});
});
