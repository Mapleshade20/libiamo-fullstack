import { redirect } from "@sveltejs/kit";
import { describe, expect, it, vi } from "vitest";
import { load } from "$routes/(admin)/+layout.server";

vi.mock("@sveltejs/kit", () => ({
	redirect: vi.fn((status, location) => {
		const error = new Error("Redirect");
		(error as any).status = status;
		(error as any).location = location;
		throw error;
	}),
}));

describe("(admin) Layout Server Load", () => {
	it("should redirect to /sign-in if no user exists", async () => {
		const event = { locals: { user: null } } as any;

		await expect(load(event)).rejects.toThrow("Redirect");
		expect(redirect).toHaveBeenCalledWith(302, "/sign-in");
	});

	it("should redirect to / if user is not an admin", async () => {
		const event = { locals: { user: { role: "user" } } } as any;

		await expect(load(event)).rejects.toThrow("Redirect");
		expect(redirect).toHaveBeenCalledWith(302, "/");
	});

	it("should return the user object if user is an admin", async () => {
		const adminUser = { role: "admin", id: 1 };
		const event = { locals: { user: adminUser } } as any;

		const result = await load(event);
		expect(result).toEqual({ user: adminUser });
	});
});
