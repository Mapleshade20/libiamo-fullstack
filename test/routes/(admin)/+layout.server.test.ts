import { error, redirect } from "@sveltejs/kit";
import { describe, expect, it, vi } from "vitest";
import { load } from "$routes/(admin)/+layout.server";

vi.mock("@sveltejs/kit", () => ({
	error: vi.fn((status, body) => {
		const error = new Error(typeof body === "string" ? body : "Error");
		(error as any).status = status;
		throw error;
	}),
	redirect: vi.fn((status, location) => {
		const error = new Error("Redirect");
		(error as any).status = status;
		(error as any).location = location;
		throw error;
	}),
}));

vi.mock("$lib/server/db", () => ({
	db: {
		select: vi.fn(() => ({
			from: vi.fn(() => ({
				where: vi.fn().mockResolvedValue([{ count: 0 }]),
			})),
		})),
	},
}));

vi.mock("$lib/server/db/schema", () => ({
	templateContribution: { status: "status" },
}));

vi.mock("drizzle-orm", () => {
	const eq = vi.fn(() => "eq");
	const sql = vi.fn(() => "sql") as unknown as typeof import("drizzle-orm").sql;
	return { eq, sql };
});

describe("(admin) Layout Server Load", () => {
	it("should redirect to /sign-in if no user exists", async () => {
		const event = { locals: { user: null } } as any;

		await expect(load(event)).rejects.toThrow("Redirect");
		expect(redirect).toHaveBeenCalledWith(302, "/sign-in");
	});

	it("should return 403 if user is not an admin", async () => {
		const event = { locals: { user: { role: "learner" } } } as any;

		await expect(load(event)).rejects.toMatchObject({ status: 403 });
		expect(error).toHaveBeenCalledWith(403, "Forbidden");
	});

	it("should return the user object if user is an admin", async () => {
		const adminUser = { role: "admin", id: 1, name: "Admin", email: "admin@example.com", activeLanguage: "en" };
		const event = { locals: { user: adminUser } } as any;

		const result = await load(event);
		expect(result).toEqual({
			user: { role: "admin", name: "Admin", email: "admin@example.com", activeLanguage: "en" },
			pendingReviewCount: 0,
		});
	});
});
