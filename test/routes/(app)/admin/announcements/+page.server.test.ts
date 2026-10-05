import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	createAnnouncement: vi.fn(),
	deleteAnnouncement: vi.fn(),
	listAnnouncements: vi.fn(),
}));

vi.mock("$lib/server/announcement", () => mocks);

import { actions } from "$routes/(app)/admin/announcements/+page.server";

function event(fields: Record<string, string>, role = "admin") {
	const formData = new FormData();
	for (const [key, value] of Object.entries(fields)) formData.set(key, value);
	return {
		locals: { user: { id: "admin-1", role } },
		cookies: { get: (name: string) => (name === "libiamo-browser-timezone" ? "Asia/Shanghai" : undefined) },
		request: { formData: async () => formData },
	} as never;
}

describe("admin announcements", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers({ now: new Date("2026-10-05T00:00:00Z"), toFake: ["Date"] });
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it("publishes with the expiry read as wall time in the admin's timezone", async () => {
		await actions.publish(event({ title: " Maintenance ", body: "Back soon.", expiresAt: "2026-10-06T09:30" }));

		expect(mocks.createAnnouncement).toHaveBeenCalledWith({
			title: "Maintenance",
			body: "Back soon.",
			expiresAt: new Date("2026-10-06T01:30:00Z"),
			createdBy: "admin-1",
		});
	});

	it("keeps an announcement without an expiry until it is deleted", async () => {
		await actions.publish(event({ title: "Hello", body: "Welcome.", expiresAt: "" }));
		expect(mocks.createAnnouncement).toHaveBeenCalledWith(expect.objectContaining({ expiresAt: null }));
	});

	it("refuses an expiry in the past and empty content", async () => {
		const past = (await actions.publish(event({ title: "Late", body: "Too late.", expiresAt: "2026-10-01T08:00" }))) as any;
		const empty = (await actions.publish(event({ title: "", body: "", expiresAt: "" }))) as any;

		expect(past.status).toBe(400);
		expect(past.data.errors.expiresAt).toHaveLength(1);
		expect(Object.keys(empty.data.errors).sort()).toEqual(["body", "title"]);
		expect(mocks.createAnnouncement).not.toHaveBeenCalled();
	});

	it("deletes by id and is closed to learners", async () => {
		await actions.delete(event({ id: "7" }));
		expect(mocks.deleteAnnouncement).toHaveBeenCalledWith(7);
		await expect(actions.delete(event({ id: "7" }, "user"))).rejects.toMatchObject({ status: 403 });
	});
});
