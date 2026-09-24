import { beforeEach, describe, expect, it, vi } from "vitest";
import { QUEST_HALL_DEPENDENCY } from "$lib/quest-hall/navigation";
import { loadQuestHallData } from "$lib/server/quest-hall/hall";
import { load } from "$routes/(app)/(hall)/+layout.server";
import { hallData } from "../../../fixtures/quest-hall";

vi.mock("$lib/time/browser-timezone", async (importOriginal) => ({ ...(await importOriginal()), getBrowserTimezone: vi.fn(() => "UTC") }));
vi.mock("$lib/server/quest-hall/hall", () => ({ loadQuestHallData: vi.fn(async () => hallData()) }));

function event(user: unknown) {
	return {
		locals: { user },
		cookies: {},
		depends: vi.fn(),
		get url(): URL {
			throw new Error("The Hall layout must not depend on the URL");
		},
		get params(): never {
			throw new Error("The Hall layout must not depend on route params");
		},
	};
}

describe("(hall) layout +layout.server", () => {
	beforeEach(() => vi.clearAllMocks());

	it("authenticates before loading the book", async () => {
		await expect(load(event(null) as any)).rejects.toMatchObject({ status: 302, location: "/sign-in" });
		expect(loadQuestHallData).not.toHaveBeenCalled();
	});

	// Reading neither URL nor params is what lets `/` and `/task/[id]` share one load.
	it("loads the book once for the learner's timezone, refreshing only through the Hall dependency", async () => {
		const request = event({ id: "u1" });
		const result = (await load(request as any)) as any;
		expect(result).toEqual({ hall: hallData() });
		expect(loadQuestHallData).toHaveBeenCalledWith({ id: "u1" }, "UTC");
		expect(request.depends).toHaveBeenCalledWith(QUEST_HALL_DEPENDENCY);
	});
});
