import { eq } from "drizzle-orm";
import { db } from "$lib/server/db";
import { task, template, translationSourceSet } from "$lib/server/db/schema";

export type DeletionSafetyResult =
	| { safe: true }
	| {
			safe: false;
			message: string;
	  };

const safeToDelete: DeletionSafetyResult = { safe: true };

async function hasScheduledTaskForTemplate(templateId: number) {
	const [existingTask] = await db.select({ id: task.id }).from(task).where(eq(task.templateId, templateId)).limit(1);
	return Boolean(existingTask);
}

async function hasScheduledTaskForVariant(variantId: number) {
	const [existingTask] = await db.select({ id: task.id }).from(task).where(eq(task.variantId, variantId)).limit(1);
	return Boolean(existingTask);
}

async function hasTranslationAttemptForTemplate(templateId: number) {
	const [existingAttempt] = await db
		.select({ id: translationSourceSet.id })
		.from(translationSourceSet)
		.where(eq(translationSourceSet.templateId, templateId))
		.limit(1);
	return Boolean(existingAttempt);
}

export async function checkTemplateVariantDeletionSafety(variantId: number): Promise<DeletionSafetyResult> {
	if (await hasScheduledTaskForVariant(variantId)) {
		return {
			safe: false,
			message: "This variant has scheduled tasks or practice history. Leave it inactive to preserve learner data.",
		};
	}

	return safeToDelete;
}

export async function checkTemplateDeletionSafety(templateId: number): Promise<DeletionSafetyResult> {
	const [existingTemplate] = await db.select({ id: template.id }).from(template).where(eq(template.id, templateId)).limit(1);
	if (!existingTemplate) {
		return {
			safe: false,
			message: "Template not found.",
		};
	}

	if (await hasScheduledTaskForTemplate(templateId)) {
		return {
			safe: false,
			message: "This template has scheduled tasks or practice history. Leave it inactive to preserve learner data.",
		};
	}

	if (await hasTranslationAttemptForTemplate(templateId)) {
		return {
			safe: false,
			message: "This template has translation attempts. Leave it inactive to preserve learner data.",
		};
	}

	return safeToDelete;
}
