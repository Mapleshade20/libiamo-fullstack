import { render } from "svelte/server";
import { describe, expect, it } from "vitest";
import TaskPreparation from "$lib/components/task/TaskPreparation.svelte";
import type { TaskPreparationTask } from "$lib/server/task-preparation";

function task(overrides: Partial<TaskPreparationTask> = {}): TaskPreparationTask {
	return {
		id: 42,
		title: "Collect a parcel",
		description: "Ask your neighbour for a parcel they received for you.",
		objectives: ["Greet your neighbour", "Ask for the parcel politely"],
		language: "fr",
		templateInteractionType: "chat",
		templateUi: "imessage",
		templateDifficulty: 2,
		materialsMd: null,
		pointReward: 20,
		sessionStatus: null,
		...overrides,
	};
}

describe("TaskPreparation", () => {
	it("renders the existing preparation actions for an unfinished task", () => {
		const { body } = render(TaskPreparation, {
			props: { task: task(), nativeLanguage: "en" },
		});

		expect(body).toContain("Collect a parcel");
		expect(body).toContain("Expressions Utiles");
		expect(body).toContain('href="/task/42/session"');
		expect(body).toContain("Commencer la Pratique");
	});

	it("keeps completed tasks on the report path", () => {
		const { body } = render(TaskPreparation, {
			props: { task: task({ sessionStatus: "evaluated" }), nativeLanguage: "en" },
		});

		expect(body).toContain("Terminée");
		expect(body).toContain('href="/task/42/feedback"');
		expect(body).toContain("Voir le Rapport");
		expect(body).not.toContain("Expressions Utiles");
	});

	it("does not link a simulated completion to a report that does not exist", () => {
		const { body } = render(TaskPreparation, {
			props: { task: task({ sessionStatus: "completed" }), nativeLanguage: "en", simulated: true },
		});

		expect(body).toContain("Bilan simulé");
		expect(body).not.toContain('href="/task/42/feedback"');
	});

	it("uses a nested heading when embedded in the Quest Menu", () => {
		const { body } = render(TaskPreparation, {
			props: { task: task(), nativeLanguage: "en", mode: "pane" },
		});

		expect(body).toContain('<h2 id="task-preparation-title"');
		expect(body).not.toContain('<h1 id="task-preparation-title"');
	});
});
