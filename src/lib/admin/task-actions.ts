/** Shared parsing for the admin task editor: the form, and the single-task JSON document. */

import { z } from "zod";
import { TASK_JSON_VERSION, type TaskRotation, taskJsonExtrasSchema, taskJsonSchema, taskRotationSchema, taskSchema } from "$lib/schemas";

export type TaskInput = z.output<typeof taskSchema>;

export type TaskFormResult =
	| { success: true; task: TaskInput; rotation: TaskRotation }
	| { success: false; errors: Record<string, string[] | undefined>; values: Record<string, FormDataEntryValue> };

/** Parses the admin task form. Rotation only applies to chat tasks. */
export function parseTaskForm(formData: FormData): TaskFormResult {
	const values = Object.fromEntries(formData);
	const parsed = taskSchema.safeParse(values);
	if (!parsed.success) return { success: false, errors: z.flattenError(parsed.error).fieldErrors, values };
	const rotation = parsed.data.interactionType === "chat" ? taskRotationSchema.parse(values.rotation) : "none";
	return { success: true, task: parsed.data, rotation };
}

export type TaskJsonPayload = { task: TaskInput; isActive: boolean; rotation: TaskRotation };

export function parseTaskJson(rawJson: string): { success: true; data: TaskJsonPayload } | { success: false; error: string } {
	let raw: unknown;
	try {
		raw = JSON.parse(rawJson);
	} catch {
		return { success: false, error: "Invalid JSON." };
	}
	const document = taskJsonSchema.safeParse(raw);
	if (!document.success) return { success: false, error: `Expected a version ${TASK_JSON_VERSION} task export. ${z.prettifyError(document.error)}` };
	const task = taskSchema.safeParse(document.data.task);
	if (!task.success) return { success: false, error: z.prettifyError(task.error) };
	const extras = taskJsonExtrasSchema.safeParse(document.data.task);
	if (!extras.success) return { success: false, error: z.prettifyError(extras.error) };
	return {
		success: true,
		data: { task: task.data, isActive: extras.data.isActive, rotation: task.data.interactionType === "chat" ? extras.data.rotation : "none" },
	};
}

type ExportableTask = TaskInput & { isActive: boolean };

/** The JSON document `parseTaskJson` reads back. */
export function buildTaskExport(task: ExportableTask, rotation: TaskRotation) {
	return {
		version: TASK_JSON_VERSION,
		task: {
			language: task.language,
			interactionType: task.interactionType,
			ui: task.ui,
			isActive: task.isActive,
			difficulty: task.difficulty,
			title: task.title,
			shortObjective: task.shortObjective,
			description: task.description,
			objectives: task.objectives,
			materialsMd: task.materialsMd,
			tags: task.tags,
			estimatedWords: task.estimatedWords,
			...(task.interactionType === "chat"
				? { urgency: task.urgency, maxTurns: task.maxTurns, agentPrompt: task.agentPrompt, openingState: task.openingState, rotation }
				: { referenceParagraphs: task.referenceParagraphs, translationContext: task.translationContext }),
		},
	};
}
