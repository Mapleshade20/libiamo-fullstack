import { render } from "svelte/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("$app/state", () => ({ page: { url: new URL("https://libiamo.test/task/5/session?lineup=12") } }));

import SessionPage from "../../../../../../src/routes/(app)/task/[id]/session/+page.svelte";

describe("session page", () => {
	it("keeps a pinned lineup on the way back to the task", () => {
		const data = {
			taskId: "5",
			task: { title: "Dinner", language: "en", ui: "imessage", openingState: {} },
			user: { name: "Learner" },
			avatarUrl: "",
			session: null,
			maxTurns: 0,
			readReceipt: null,
		};
		const { body } = render(SessionPage, { props: { data } as never });

		expect(body).toContain('href="/task/5?lineup=12"');
	});
});
