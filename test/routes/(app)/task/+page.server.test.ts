import { describe, expect, it } from "vitest";
import { load } from "$routes/(app)/task/+page.server";

describe("(app) task +page.server", () => {
	it("redirects the task root to the Quest Hall", async () => {
		await expect(async () => load({} as never)).rejects.toMatchObject({ status: 303, location: "/" });
	});
});
