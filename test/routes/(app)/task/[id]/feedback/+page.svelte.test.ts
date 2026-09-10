import { render } from "svelte/server";
import { expect, it } from "vitest";
import FeedbackPage from "$routes/(app)/task/[id]/feedback/+page.svelte";

it("renders already-generated feedback in the server HTML", () => {
	const { body } = render(FeedbackPage, {
		props: {
			data: {
				taskId: "12",
				sessionId: 24,
				taskTitle: "A conversation",
				language: "en",
				user: { activeLanguage: "en" },
				conversation: { chains: [], allMessages: [] },
				existingFeedback: {
					feedbackLanguage: "en",
					annotations: [],
					objectives: [{ text: "Explain your choice", grade: "A" }],
					summary: "Your explanation was clear and considerate.",
				},
			} as any,
		},
	});
	expect(body).toContain("Your explanation was clear and considerate.");
	expect(body).toContain("Explain your choice");
});
