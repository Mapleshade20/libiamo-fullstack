import { render } from "svelte/server";
import { describe, expect, it } from "vitest";
import QuestEdition from "$lib/components/quest-hall/QuestEdition.svelte";
import type { HallQuest } from "$lib/quest-hall";

function quest(overrides: Partial<HallQuest> = {}): HallQuest {
	return {
		id: 1,
		title: "A new quest",
		shortObjective: "Complete the scenario.",
		templateUi: "imessage",
		templateDifficulty: 2,
		templateInteractionType: "chat",
		pointReward: 20,
		sessionStatus: null,
		unreadCount: null,
		hasUnreadReply: false,
		...overrides,
	};
}

describe("QuestEdition", () => {
	it("renders a new-reply marker for asynchronous conversations", () => {
		const { body } = render(QuestEdition, {
			props: { id: "daily", title: "Today", lang: "en", tasks: [quest({ hasUnreadReply: true })] },
		});

		expect(body).toContain("New reply");
	});

	it("server-renders the in-progress quest as the selected edition", () => {
		const { body } = render(QuestEdition, {
			props: {
				id: "daily",
				title: "Today",
				lang: "en",
				tasks: [quest({ id: 1 }), quest({ id: 2, title: "Continue this", sessionStatus: "in_progress" })],
			},
		});

		expect(body).toContain("Continue this");
		expect(body).toContain('href="/task/2/session"');
		expect(body).toContain("Continue");
		expect(body).toContain('aria-controls="quest-mobile-detail-daily-2 quest-desktop-detail-daily-2"');
		expect(body).not.toContain('id="quest-brief-title-2"');
	});

	it("renders a completed quest action directly to feedback", () => {
		const { body } = render(QuestEdition, {
			props: {
				id: "weekly",
				title: "This Week",
				lang: "en",
				tasks: [quest({ id: 8, title: "A finished quest", sessionStatus: "evaluated" })],
			},
		});

		expect(body).toContain('href="/task/8/feedback"');
		expect(body).toContain("Review Report");
		expect(body).not.toContain("1 / 1");
	});
});
