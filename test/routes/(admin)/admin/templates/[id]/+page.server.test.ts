import type { ActionFailure } from "@sveltejs/kit";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "$lib/server/db";
import { actions, load } from "$routes/(admin)/admin/templates/[id]/+page.server";

// ── Mock DB ──────────────────────────────────────────────────────────────

// Dynamic queue to handle consecutive database select calls within a single test
let dbSelectQueue: any[][] = [];

vi.mock("$lib/server/db", () => {
	const mockDb: any = {
		select: vi.fn(() => {
			const val = dbSelectQueue.shift() || [];
			const chain = Promise.resolve(val) as any;
			chain.from = vi.fn(() => chain);
			chain.where = vi.fn(() => chain);
			chain.limit = vi.fn(() => chain);
			chain.orderBy = vi.fn(() => chain);
			return chain;
		}),
		update: vi.fn(() => {
			const chain = Promise.resolve() as any;
			chain.set = vi.fn(() => chain);
			chain.where = vi.fn(() => chain);
			return chain;
		}),
		insert: vi.fn(() => {
			const chain = Promise.resolve() as any;
			chain.values = vi.fn(() => chain);
			return chain;
		}),
		delete: vi.fn(() => {
			const chain = Promise.resolve() as any;
			chain.where = vi.fn(() => chain);
			return chain;
		}),
	};
	mockDb.transaction = vi.fn(async (callback) => callback(mockDb));
	return { db: mockDb };
});

vi.mock("$lib/server/db/schema", () => ({
	task: { id: "task.id", templateId: "task.templateId", variantId: "task.variantId" },
	template: { id: "id", isActive: "isActive" },
	templateVariant: { id: "id", templateId: "templateId", isActive: "isActive" },
	translationSourceSet: { id: "translationSourceSet.id", templateId: "translationSourceSet.templateId" },
}));

vi.mock("drizzle-orm", () => ({
	eq: vi.fn((_col, _val) => "eq"),
	and: vi.fn((..._args) => "and"),
}));

// ── Helpers ──────────────────────────────────────────────────────────────

function createActionEvent(entries: Record<string, string>, paramsId = "1") {
	const formData = new FormData();
	for (const [key, value] of Object.entries(entries)) {
		formData.append(key, value);
	}
	return {
		params: { id: paramsId },
		locals: { user: { id: "admin-1", role: "admin" } },
		request: {
			formData: vi.fn().mockResolvedValue(formData),
			headers: new Headers(),
		},
	} as any;
}

const validTemplateEntries: Record<string, string> = {
	language: "en",
	interactionType: "chat",
	urgency: "high",
	ui: "imessage",
	cadence: "daily",
	difficulty: "1",
	pointReward: "10",
	gemReward: "5",
	titleBase: "Chat with {{friend}} about {{topic}}",
	isActive: "on",
};

const validTranslationEntries: Record<string, string> = {
	language: "fr",
	interactionType: "translate",
	ui: "translator",
	cadence: "none",
	difficulty: "2",
	pointReward: "10",
	gemReward: "5",
	titleBase: "A letter",
	descriptionBase: "Translate a personal letter.",
	agentPromptBase: "a letter to a close friend",
	translationReference: "Bonjour.",
};

const sampleTemplate = {
	id: 1,
	ui: "imessage",
	titleBase: "Chat with {{friend}} about {{topic}}",
	shortObjectiveBase: null,
	descriptionBase: null,
	agentPromptBase: null,
	objectivesBase: null,
	isActive: true,
};

describe("Admin Templates [id] +page.server", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		dbSelectQueue = []; // Reset queue before each test
	});

	describe("load function", () => {
		it("returns 404 for non-numeric id", async () => {
			const event = { locals: { user: { id: "admin-1", role: "admin" } }, params: { id: "abc" } } as any;
			try {
				await load(event);
				expect.fail("Should have thrown");
			} catch (err: any) {
				expect(err.status).toBe(404);
			}
		});

		it("returns 404 if template is not found", async () => {
			dbSelectQueue.push([]); // Empty result for template query
			const event = { locals: { user: { id: "admin-1", role: "admin" } }, params: { id: "999" } } as any;
			try {
				await load(event);
				expect.fail("Should have thrown");
			} catch (err: any) {
				expect(err.status).toBe(404);
			}
		});

		it("loads template and variants successfully", async () => {
			dbSelectQueue.push([sampleTemplate]); // 1st query: Template
			dbSelectQueue.push([{ id: 1, slotValues: {} }]); // 2nd query: Variants

			const event = { locals: { user: { id: "admin-1", role: "admin" } }, params: { id: "1" } } as any;
			const result = await load(event);

			expect((result as any).template).toBeDefined();
			expect((result as any).variants).toBeDefined();
			expect((result as any).template.id).toBe(1);
		});
	});

	describe("authorization", () => {
		it.each([
			"save",
			"delete",
			"importJson",
			"addVariant",
			"saveVariant",
			"deleteVariant",
			"activateVariant",
			"deactivateVariant",
		] as const)("returns 403 for non-admin users before %s", async (actionName) => {
			const event = createActionEvent(validTemplateEntries, "1");
			event.locals.user.role = "learner";

			await expect(actions[actionName](event)).rejects.toMatchObject({ status: 403 });
			expect(event.request.formData).not.toHaveBeenCalled();
			expect(db.select).not.toHaveBeenCalled();
			expect(db.update).not.toHaveBeenCalled();
			expect(db.insert).not.toHaveBeenCalled();
		});
	});

	describe("save action", () => {
		it("returns 400 with field errors for invalid template data", async () => {
			const event = createActionEvent({}, "1");
			const result = (await actions.save(event)) as ActionFailure<any>;
			expect(result.status).toBe(400);
			expect(result.data?.errors?.titleBase).toBeDefined();
		});

		it("returns saved: true on success", async () => {
			const event = createActionEvent(validTemplateEntries, "1");
			const result = await actions.save(event);
			expect(result).toEqual({ saved: true });
		});

		it("clears unsupported translation fields before update", async () => {
			const event = createActionEvent(
				{
					...validTranslationEntries,
					agentStartsFirst: "on",
					shortObjectiveBase: "Translate this letter.",
					materialsMd: "# Background",
				},
				"1",
			);

			expect(await actions.save(event)).toEqual({ saved: true });
			const update = (db.update as any).mock.results[0].value;
			expect(update.set).toHaveBeenCalledWith(expect.objectContaining({ agentStartsFirst: false, shortObjectiveBase: null, materialsMd: null }));
		});
	});

	describe("delete action", () => {
		it("hard deletes an unused template and its variants, then redirects", async () => {
			dbSelectQueue.push([{ id: 1 }]); // template exists
			dbSelectQueue.push([]); // no tasks for template
			dbSelectQueue.push([]); // no translation attempts

			const event = createActionEvent({}, "1");
			await expect(actions.delete(event)).rejects.toMatchObject({
				status: 302,
				location: "/admin/templates",
			});
			expect(db.transaction).toHaveBeenCalledOnce();
			expect(db.delete).toHaveBeenCalledTimes(2);
			expect(db.update).not.toHaveBeenCalled();
		});

		it("returns 400 for non-numeric template id", async () => {
			const event = createActionEvent({}, "abc");
			const result = (await actions.delete(event)) as ActionFailure<any>;

			expect(result.status).toBe(400);
			expect(result.data?.action).toBe("delete");
			expect(result.data?.message).toBe("Invalid template id");
			expect(db.transaction).not.toHaveBeenCalled();
			expect(db.delete).not.toHaveBeenCalled();
		});

		it("blocks deleting a template with scheduled tasks", async () => {
			dbSelectQueue.push([{ id: 1 }]); // template exists
			dbSelectQueue.push([{ id: 10 }]); // task exists

			const event = createActionEvent({}, "1");
			const result = (await actions.delete(event)) as ActionFailure<any>;

			expect(result.status).toBe(400);
			expect(result.data?.action).toBe("delete");
			expect(result.data?.message).toContain("scheduled tasks");
			expect(db.transaction).not.toHaveBeenCalled();
			expect(db.delete).not.toHaveBeenCalled();
		});

		it("blocks deleting a template with translation attempts", async () => {
			dbSelectQueue.push([{ id: 1 }]); // template exists
			dbSelectQueue.push([]); // no tasks for template
			dbSelectQueue.push([{ id: 20 }]); // translation attempt exists

			const event = createActionEvent({}, "1");
			const result = (await actions.delete(event)) as ActionFailure<any>;

			expect(result.status).toBe(400);
			expect(result.data?.action).toBe("delete");
			expect(result.data?.message).toContain("translation attempts");
			expect(db.transaction).not.toHaveBeenCalled();
			expect(db.delete).not.toHaveBeenCalled();
		});
	});

	describe("importJson action", () => {
		it("returns 400 for malformed JSON", async () => {
			const event = createActionEvent({ templateJson: "not json" }, "1");
			const result = (await actions.importJson(event)) as ActionFailure<any>;
			expect(result.status).toBe(400);
			expect(result.data?.action).toBe("importJson");
			expect(result.data?.message).toContain("Invalid JSON");
		});

		it("returns imported: true for valid JSON", async () => {
			const event = createActionEvent(
				{
					templateJson: JSON.stringify({
						version: 1,
						template: {
							language: "en",
							interactionType: "chat",
							ui: "imessage",
							cadence: "daily",
							difficulty: 1,
							pointReward: 10,
							gemReward: 5,
							titleBase: "Chat with {{friend}}",
						},
						variants: [
							{
								isActive: true,
								slotValues: { friend: "Alice" },
								openingState: { previousMessages: [] },
							},
						],
					}),
				},
				"1",
			);

			const result = await actions.importJson(event);
			expect(result).toEqual({ imported: true });
			expect(db.transaction).toHaveBeenCalledOnce();
			expect(db.delete).not.toHaveBeenCalled();
		});

		it("updates imported variants by id, inserts id-less variants, and deactivates omitted variants", async () => {
			dbSelectQueue.push([{ id: 2 }, { id: 3 }]);
			const event = createActionEvent(
				{
					templateJson: JSON.stringify({
						version: 1,
						template: {
							language: "en",
							interactionType: "chat",
							ui: "imessage",
							cadence: "daily",
							difficulty: 1,
							pointReward: 10,
							gemReward: 5,
							titleBase: "Chat with {{friend}}",
						},
						variants: [
							{
								id: 2,
								isActive: true,
								slotValues: { friend: "Alice" },
								openingState: { previousMessages: [] },
							},
							{
								isActive: true,
								slotValues: { friend: "Bob" },
								openingState: { previousMessages: [] },
							},
						],
					}),
				},
				"1",
			);

			const result = await actions.importJson(event);

			expect(result).toEqual({ imported: true });
			expect(db.delete).not.toHaveBeenCalled();
			expect(db.insert).toHaveBeenCalledTimes(1);
			expect(db.update).toHaveBeenCalledTimes(3); // template, imported variant #2, omitted variant #3
			const updateSetPayloads = (db.update as any).mock.results.map((result: any) => result.value.set.mock.calls[0]?.[0]);
			expect(updateSetPayloads).toContainEqual({ isActive: false });
			expect(updateSetPayloads).toContainEqual({
				isActive: true,
				slotValues: { friend: "Alice" },
				openingState: { previousMessages: [] },
			});
		});

		it("returns 400 for duplicate imported variant ids", async () => {
			dbSelectQueue.push([{ id: 2 }]);
			const event = createActionEvent({
				templateJson: JSON.stringify({
					version: 1,
					template: {
						language: "en",
						interactionType: "chat",
						ui: "imessage",
						cadence: "daily",
						difficulty: 1,
						pointReward: 10,
						gemReward: 5,
						titleBase: "Chat with {{friend}}",
					},
					variants: [
						{ id: 2, isActive: true, slotValues: { friend: "Alice" }, openingState: { previousMessages: [] } },
						{ id: 2, isActive: true, slotValues: { friend: "Bob" }, openingState: { previousMessages: [] } },
					],
				}),
			});

			const result = (await actions.importJson(event)) as ActionFailure<any>;

			expect(result.status).toBe(400);
			expect(result.data?.message).toContain("duplicate variant ids");
			expect(db.transaction).not.toHaveBeenCalled();
		});

		it("returns 400 when an imported variant id does not belong to this template", async () => {
			dbSelectQueue.push([{ id: 2 }]);
			const event = createActionEvent({
				templateJson: JSON.stringify({
					version: 1,
					template: {
						language: "en",
						interactionType: "chat",
						ui: "imessage",
						cadence: "daily",
						difficulty: 1,
						pointReward: 10,
						gemReward: 5,
						titleBase: "Chat with {{friend}}",
					},
					variants: [{ id: 999, isActive: true, slotValues: { friend: "Alice" }, openingState: { previousMessages: [] } }],
				}),
			});

			const result = (await actions.importJson(event)) as ActionFailure<any>;

			expect(result.status).toBe(400);
			expect(result.data?.message).toContain("does not belong to this template");
			expect(db.transaction).not.toHaveBeenCalled();
		});
	});

	describe("addVariant action", () => {
		it("returns 400 when variant is missing slot values", async () => {
			dbSelectQueue.push([sampleTemplate]);
			const event = createActionEvent(
				{
					slotValues: JSON.stringify({ friend: "Alice" }), // missing topic
					openingState: JSON.stringify({ previousMessages: [] }),
				},
				"1",
			);
			const result = (await actions.addVariant(event)) as ActionFailure<any>;
			expect(result.status).toBe(400);
			expect(result.data?.action).toBe("addVariant");
			expect(result.data?.message).toContain("topic");
		});

		it("returns addedVariant: true on success", async () => {
			dbSelectQueue.push([sampleTemplate]); // Provide template to parse UI logic
			const event = createActionEvent(
				{
					slotValues: JSON.stringify({ friend: "Alice", topic: "weather" }),
					openingState: JSON.stringify({ previousMessages: [] }),
				},
				"1",
			);
			const result = await actions.addVariant(event);
			expect(result).toEqual({ addedVariant: true });
		});
	});

	describe("saveVariant action", () => {
		it("returns 400 for non-numeric variantId", async () => {
			const event = createActionEvent({ variantId: "abc" }, "1");
			const result = (await actions.saveVariant(event)) as ActionFailure<any>;
			expect(result.status).toBe(400);
			expect(result.data?.action).toBe("saveVariant");
		});

		it("returns savedVariant: true on success", async () => {
			dbSelectQueue.push([sampleTemplate]); // 1st query: get template
			dbSelectQueue.push([{ id: 2 }]); // 2nd query: check if variant exists

			const event = createActionEvent(
				{
					variantId: "2",
					slotValues: JSON.stringify({ friend: "Alice", topic: "Code" }),
					openingState: JSON.stringify({ previousMessages: [] }),
				},
				"1",
			);

			const result = await actions.saveVariant(event);
			expect(result).toEqual({ savedVariant: true });
		});
	});

	describe("deleteVariant action", () => {
		it("returns 400 for non-numeric variantId", async () => {
			const event = createActionEvent({ variantId: "abc" }, "1");
			const result = (await actions.deleteVariant(event)) as ActionFailure<any>;

			expect(result.status).toBe(400);
			expect(result.data?.action).toBe("deleteVariant");
			expect(db.delete).not.toHaveBeenCalled();
		});

		it("returns 404 when variant does not belong to the template", async () => {
			dbSelectQueue.push([]);

			const event = createActionEvent({ variantId: "2" }, "1");
			const result = (await actions.deleteVariant(event)) as ActionFailure<any>;

			expect(result.status).toBe(404);
			expect(result.data?.action).toBe("deleteVariant");
			expect(result.data?.message).toBe("Variant not found");
			expect(db.delete).not.toHaveBeenCalled();
		});

		it("blocks deleting a variant with scheduled tasks", async () => {
			dbSelectQueue.push([{ isActive: true }]); // variant exists
			dbSelectQueue.push([{ id: 10 }]); // task exists for variant

			const event = createActionEvent({ variantId: "2" }, "1");
			const result = (await actions.deleteVariant(event)) as ActionFailure<any>;

			expect(result.status).toBe(400);
			expect(result.data?.action).toBe("deleteVariant");
			expect(result.data?.message).toContain("practice history");
			expect(db.delete).not.toHaveBeenCalled();
		});

		it("hard deletes an unused variant", async () => {
			dbSelectQueue.push([{ isActive: true }]); // variant exists
			dbSelectQueue.push([]); // no task for variant
			dbSelectQueue.push([{ id: 2 }, { id: 3 }]); // other active variants remain

			const event = createActionEvent({ variantId: "2" }, "1");
			const result = await actions.deleteVariant(event);

			expect(result).toEqual({ deletedVariant: true });
			expect(db.delete).toHaveBeenCalledTimes(1);
		});

		it("blocks deleting the last active unused variant", async () => {
			dbSelectQueue.push([{ isActive: true }]); // variant exists
			dbSelectQueue.push([]); // no task for variant
			dbSelectQueue.push([{ id: 2 }]); // only active variant

			const event = createActionEvent({ variantId: "2" }, "1");
			const result = (await actions.deleteVariant(event)) as ActionFailure<any>;

			expect(result.status).toBe(400);
			expect(result.data?.action).toBe("deleteVariant");
			expect(result.data?.message).toContain("last active variant");
			expect(db.delete).not.toHaveBeenCalled();
		});
	});

	describe("activateVariant action", () => {
		it("returns 400 for non-numeric variantId", async () => {
			const event = createActionEvent({ variantId: "abc" }, "1");
			const result = (await actions.activateVariant(event)) as ActionFailure<any>;
			expect(result.status).toBe(400);
			expect(result.data?.action).toBe("activateVariant");
		});

		it("returns activated: true when updating an inactive variant", async () => {
			dbSelectQueue.push([{ isActive: false }]); // Ensure variant exists and is inactive

			const event = createActionEvent({ variantId: "2" }, "1");
			const result = await actions.activateVariant(event);

			expect(result).toEqual({ activated: true });
		});
	});

	describe("deactivateVariant action", () => {
		it("returns 400 for non-numeric variantId", async () => {
			const event = createActionEvent({ variantId: "abc" }, "1");
			const result = (await actions.deactivateVariant(event)) as ActionFailure<any>;
			expect(result.status).toBe(400);
			expect(result.data?.action).toBe("deactivateVariant");
		});

		it("fails if it tries to deactivate the last active variant", async () => {
			dbSelectQueue.push([{ isActive: true }]); // 1st: The target variant exists and is active
			dbSelectQueue.push([{ id: 2 }]); // 2nd: Database returns only 1 active variant globally

			const event = createActionEvent({ variantId: "2" }, "1");
			const result = (await actions.deactivateVariant(event)) as ActionFailure<any>;

			expect(result.status).toBe(400);
			expect(result.data?.action).toBe("deactivateVariant");
			expect(result.data?.message).toContain("last active variant");
		});

		it("deactivates successfully if there are other active variants", async () => {
			dbSelectQueue.push([{ isActive: true }]); // 1st: Target exists and is active
			dbSelectQueue.push([{ id: 2 }, { id: 3 }]); // 2nd: Database confirms multiple active variants

			const event = createActionEvent({ variantId: "2" }, "1");
			const result = await actions.deactivateVariant(event);

			expect(result).toEqual({ deactivated: true });
		});
	});
});
