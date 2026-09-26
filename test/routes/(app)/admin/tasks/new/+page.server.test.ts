import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	selectRows: [] as unknown[],
	createTask: vi.fn(),
}));

vi.mock("$lib/server/db", () => {
	const selectChain = () => {
		const chain = Promise.resolve(mocks.selectRows) as Promise<unknown[]> & Record<string, unknown>;
		for (const method of ["from", "where", "limit"]) chain[method] = vi.fn(() => chain);
		return chain;
	};
	return { db: { select: vi.fn(selectChain) } };
});
vi.mock("$lib/server/admin/tasks", async (importOriginal) => ({
	ContributionAlreadyReviewedError: (await importOriginal<typeof import("$lib/server/admin/tasks")>()).ContributionAlreadyReviewedError,
	createTask: mocks.createTask,
}));

import { ContributionAlreadyReviewedError } from "$lib/server/admin/tasks";
import { actions, load } from "$routes/(app)/admin/tasks/new/+page.server";

const admin = { id: "admin-1", role: "admin" };
const translationFields = {
	language: "fr",
	interactionType: "translate",
	ui: "translator",
	difficulty: "2",
	title: "A letter",
	translationContext: "a warm note",
	referenceParagraphs: "Bonjour.",
};

function event(fields: Record<string, string> = {}, search = "") {
	const formData = new FormData();
	for (const [key, value] of Object.entries(fields)) formData.set(key, value);
	return {
		locals: { user: admin },
		url: new URL(`https://libiamo.test/admin/tasks/new${search}`),
		request: { formData: async () => formData },
	} as never;
}

describe("admin new task", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.selectRows = [];
		mocks.createTask.mockResolvedValue(31);
	});

	it("prefills from a contribution only when one is requested", async () => {
		expect(await load(event())).toEqual({ contributionData: null });
		mocks.selectRows = [{ id: 4, title: "Proposed" }];
		expect(await load(event({}, "?fromContribution=4"))).toEqual({ contributionData: { id: 4, title: "Proposed" } });
	});

	it("creates the task and opens its editor", async () => {
		await expect(actions.create(event(translationFields))).rejects.toMatchObject({ status: 302, location: "/admin/tasks/31" });
		expect(mocks.createTask).toHaveBeenCalledWith(expect.objectContaining({ title: "A letter", referenceParagraphs: ["Bonjour."] }), {
			createdBy: "admin-1",
			rotation: "none",
			approveContributionId: undefined,
		});
	});

	it("approves a pending contribution in the same creation", async () => {
		mocks.selectRows = [{ status: "pending" }];
		await expect(actions.create(event({ ...translationFields, fromContributionId: "4" }))).rejects.toMatchObject({ status: 302 });
		expect(mocks.createTask).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ approveContributionId: 4 }));
	});

	it("rejects contributions that were already reviewed, including concurrent reviews", async () => {
		mocks.selectRows = [{ status: "approved" }];
		expect(await actions.create(event({ ...translationFields, fromContributionId: "4" }))).toMatchObject({ status: 400 });
		expect(mocks.createTask).not.toHaveBeenCalled();

		mocks.selectRows = [{ status: "pending" }];
		mocks.createTask.mockRejectedValue(new ContributionAlreadyReviewedError());
		expect(await actions.create(event({ ...translationFields, fromContributionId: "4" }))).toMatchObject({ status: 400 });
	});

	it("returns field errors for invalid input", async () => {
		const result = await actions.create(event({ ...translationFields, referenceParagraphs: "" }));
		expect(result).toMatchObject({ status: 400, data: { errors: { referenceParagraphs: expect.any(Array) } } });
	});
});
