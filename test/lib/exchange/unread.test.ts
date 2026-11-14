import { describe, expect, it } from "vitest";
import { formatUnreadBadgeCount, unreadTargetHref } from "#lib/exchange/unread.ts";

describe("unread helpers", () => {
	it("leads to the place while the exchange goes on, and to the after page once it is over", () => {
		expect(unreadTargetHref({ scenarioId: "ao3-fic", status: "in_progress" })).toBe("/scenario/ao3-fic/play");
		expect(unreadTargetHref({ scenarioId: "ao3-fic", status: "completed" })).toBe("/scenario/ao3-fic/after");
		expect(unreadTargetHref({ scenarioId: "ao3-fic", status: "abandoned" })).toBe("/scenario/ao3-fic/after");
	});

	it("caps the compact badge at nine", () => {
		expect([0, 1, 9, 10].map(formatUnreadBadgeCount)).toEqual(["0", "1", "9", "9+"]);
	});
});
