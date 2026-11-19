import { describe, expect, it } from "vitest";
import { formatUnreadBadgeCount, unreadTargetHref } from "#lib/exchange/unread.ts";

describe("unread helpers", () => {
	it("leads to the place while the exchange goes on, and to the after page once it is over", () => {
		expect(unreadTargetHref({ scenarioId: "ao3-fic", status: "in_progress", language: "es" })).toBe("/scenario/ao3-fic/play?lang=es");
		expect(unreadTargetHref({ scenarioId: "ao3-fic", status: "completed", language: "en" })).toBe("/scenario/ao3-fic/after?lang=en");
		expect(unreadTargetHref({ scenarioId: "ao3-fic", status: "abandoned", language: "zh-CN" })).toBe("/scenario/ao3-fic/after?lang=zh-CN");
	});

	it("caps the compact badge at nine", () => {
		expect([0, 1, 9, 10].map(formatUnreadBadgeCount)).toEqual(["0", "1", "9", "9+"]);
	});
});
