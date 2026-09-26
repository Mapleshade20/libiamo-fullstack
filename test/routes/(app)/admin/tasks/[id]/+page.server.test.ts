import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	selectRows: [] as unknown[],
	updateReturning: vi.fn(),
	getTaskRotation: vi.fn(),
	updateTask: vi.fn(),
	deleteUnusedTask: vi.fn(),
}));

vi.mock("$lib/server/db", () => {
	const selectChain = () => {
		const chain = Promise.resolve(mocks.selectRows) as Promise<unknown[]> & Record<string, unknown>;
		for (const method of ["from", "where", "limit"]) chain[method] = vi.fn(() => chain);
		return chain;
	};
	return {
		db: {
			select: vi.fn(selectChain),
			update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => ({ returning: mocks.updateReturning })) })) })),
		},
	};
});
vi.mock("$lib/server/admin/tasks", () => ({
	getTaskRotation: mocks.getTaskRotation,
	updateTask: mocks.updateTask,
	deleteUnusedTask: mocks.deleteUnusedTask,
}));

import { TASK_JSON_VERSION } from "$lib/schemas";
import { actions, load } from "$routes/(app)/admin/tasks/[id]/+page.server";

const admin = { id: "admin-1", role: "admin" };
const chatFields = {
	language: "en",
	interactionType: "chat",
	ui: "imessage",
	urgency: "low",
	difficulty: "1",
	title: "Weekend plans",
	openingState: JSON.stringify({ previousMessages: [] }),
	rotation: "weekly",
};

function event(fields: Record<string, string> = {}, id = "7", user: Record<string, unknown> | null = admin) {
	const formData = new FormData();
	for (const [key, value] of Object.entries(fields)) formData.set(key, value);
	return { locals: { user }, params: { id }, request: { formData: async () => formData } } as never;
}

describe("admin task editor", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.selectRows = [];
		mocks.getTaskRotation.mockResolvedValue("none");
	});

	it("is admin-only", async () => {
		await expect(load(event({}, "7", { id: "u1", role: "learner" }))).rejects.toMatchObject({ status: 403 });
	});

	it("loads the task with its rotation, and 404s unknown ids", async () => {
		await expect(load(event({}, "abc"))).rejects.toMatchObject({ status: 404 });
		await expect(load(event())).rejects.toMatchObject({ status: 404 });

		mocks.selectRows = [{ id: 7, title: "Weekend plans" }];
		mocks.getTaskRotation.mockResolvedValue("daily");
		expect(await load(event())).toEqual({ task: { id: 7, title: "Weekend plans" }, rotation: "daily" });
	});

	it("saves valid form input with the chosen rotation", async () => {
		expect(await actions.save(event(chatFields))).toEqual({ saved: true });
		expect(mocks.updateTask).toHaveBeenCalledWith(7, expect.objectContaining({ title: "Weekend plans", urgency: "low" }), { rotation: "weekly" });
	});

	it("returns field errors without saving invalid input", async () => {
		const result = await actions.save(event({ ...chatFields, title: "" }));
		expect(result).toMatchObject({ status: 400, data: { action: "save", errors: { title: expect.any(Array) } } });
		expect(mocks.updateTask).not.toHaveBeenCalled();
	});

	it("toggles the active flag", async () => {
		mocks.updateReturning.mockResolvedValue([{ id: 7 }]);
		expect(await actions.setActive(event({ isActive: "false" }))).toEqual({ deactivated: true });
		expect(await actions.setActive(event({ isActive: "true" }))).toEqual({ activated: true });
	});

	it("refuses to delete a task learners have worked on", async () => {
		mocks.deleteUnusedTask.mockResolvedValue({ deleted: false, message: "Learners have worked on this task." });
		expect(await actions.delete(event())).toMatchObject({ status: 400, data: { action: "delete" } });

		mocks.deleteUnusedTask.mockResolvedValue({ deleted: true });
		await expect(actions.delete(event())).rejects.toMatchObject({ status: 302, location: "/admin/tasks" });
	});

	it("replaces the task from a JSON export, including status and rotation", async () => {
		const { rotation: _rotation, openingState, ...fields } = chatFields;
		const document = {
			version: TASK_JSON_VERSION,
			task: { ...fields, difficulty: 1, openingState: JSON.parse(openingState), isActive: false, rotation: "daily" },
		};

		expect(await actions.importJson(event({ taskJson: JSON.stringify(document) }))).toEqual({ imported: true });
		expect(mocks.updateTask).toHaveBeenCalledWith(7, expect.objectContaining({ title: "Weekend plans" }), { rotation: "daily", isActive: false });

		expect(await actions.importJson(event({ taskJson: "{" }))).toMatchObject({ status: 400, data: { action: "importJson" } });
	});
});
