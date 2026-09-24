import { render } from "svelte/server";
import { describe, expect, it } from "vitest";
import TaskPreparation from "$lib/components/task/TaskPreparation.svelte";
import { t } from "$lib/i18n";
import type { TaskPreparationTask } from "$lib/server/task-preparation";

function task(overrides: Partial<TaskPreparationTask> = {}): TaskPreparationTask {
	return {
		id: 42,
		title: "Collect a parcel",
		description: "Ask your neighbour for a parcel they received for you.",
		objectives: ["Greet your neighbour", "Ask for the parcel politely"],
		language: "fr",
		ui: "imessage",
		difficulty: 2,
		materialsMd: null,
		sessionStatus: null,
		evaluationPhase: null,
		...overrides,
	};
}

describe("TaskPreparation", () => {
	it("renders the existing preparation actions for an unfinished task", () => {
		const { body } = render(TaskPreparation, {
			props: { task: task(), nativeLanguage: "en" },
		});

		expect(body).toContain("Collect a parcel");
		expect(body).toContain('href="/task/42/session"');
	});

	it("keeps completed tasks on the report path", () => {
		const { body } = render(TaskPreparation, {
			props: { task: task({ sessionStatus: "evaluated", evaluationPhase: "completed" }), nativeLanguage: "en" },
		});

		expect(body).toContain('href="/task/42/feedback"');
		expect(body).toContain(t("fr", "hall.menu.status.finished"));
	});

	it("sends an ended conversation back to its unfinished evaluation without marking it completed", () => {
		const { body } = render(TaskPreparation, {
			props: { task: task({ sessionStatus: "evaluated", evaluationPhase: "feedback" }), nativeLanguage: "en" },
		});

		expect(body).toContain('href="/task/42/feedback"');
		expect(body).toContain(t("fr", "hall.menu.status.reviewing"));
		expect(body).toContain(t("fr", "task.continueEvaluation"));
		expect(body).not.toContain('href="/task/42/session"');
	});

	it("does not link a simulated completion to a report that does not exist", () => {
		const { body } = render(TaskPreparation, {
			props: { task: task({ sessionStatus: "completed", evaluationPhase: "completed" }), nativeLanguage: "en", simulated: true },
		});

		expect(body).not.toContain('href="/task/42/feedback"');
	});

	it("uses a nested heading when embedded in the Quest Menu", () => {
		const { body } = render(TaskPreparation, {
			props: { task: task(), nativeLanguage: "en" },
		});

		expect(body).toContain('<h2 id="task-preparation-title"');
	});
});
