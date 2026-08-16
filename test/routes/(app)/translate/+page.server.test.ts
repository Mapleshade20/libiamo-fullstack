import { describe, expect, it } from "vitest";
import { load } from "$routes/(app)/translate/+page.server";

describe("(app) translate +page.server", () => {
	it("redirects the former catalog route to the Quest Hall", async () => {
		await expect(async () => load({} as never)).rejects.toMatchObject({ status: 303, location: "/" });
	});
});
