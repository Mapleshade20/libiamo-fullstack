/**
 * Shared helpers for admin template route actions.
 * Consolidates duplication between template "new" and "[id]" pages.
 */

import { z } from "zod";
import { extractSlotNames, getMissingSlots, parseJsonField, parseSlotValues } from "$lib/admin/variant-helpers";
import { CADENCES, INTERACTION_TYPES, LANGUAGE_CODES, UI_VARIANTS, type UiVariant } from "$lib/constants";
import { validateOpeningState } from "$lib/schemas";

// ── Form data parsing ──────────────────────────────────────────────────

/**
 * Parse variant-related fields from a FormData for the "new template" form,
 * which uses field names `firstVariantSlotValues` and `firstVariantOpeningState`.
 */
export function parseTemplateForm(formData: FormData) {
	const slotValues = parseSlotValues(formData.get("firstVariantSlotValues"));
	const openingState = parseJsonField(formData.get("firstVariantOpeningState"));
	return { slotValues, openingState };
}

/**
 * Parse variant-related fields from a FormData for the "[id]" variant actions,
 * which use field names `slotValues` and `openingState`.
 */
export function parseVariantFormData(formData: FormData) {
	const slotValues = parseSlotValues(formData.get("slotValues"));
	const openingState = parseJsonField(formData.get("openingState"));
	return { slotValues, openingState };
}

// ── Variant payload validation ─────────────────────────────────────────

type TemplateLike = {
	ui: UiVariant;
	titleBase: string;
	shortObjectiveBase?: string | null;
	descriptionBase?: string | null;
	agentPromptBase?: string | null;
	objectivesBase?: string[] | null;
};

type VariantPayloadResult =
	| { error: string; slotValues: undefined; openingState: undefined }
	| { error: undefined; slotValues: Record<string, string>; openingState: Record<string, unknown> };

/**
 * Validate opening state and slot coverage for a variant, returning
 * either an error message string or the validated payload.
 */
export function prepareVariantPayload(
	tpl: TemplateLike,
	slotValues: Record<string, string>,
	openingState: Record<string, unknown>,
	prefix = "Variant",
): VariantPayloadResult {
	// Validate opening state against selected UI schema
	const osValidation = validateOpeningState(tpl.ui, openingState);
	if (!osValidation?.success) {
		return {
			error: `Invalid opening state for ${tpl.ui}: ${osValidation?.error?.message ?? "validation failed"}`,
			slotValues: undefined,
			openingState: undefined,
		};
	}

	// Validate slot coverage
	const requiredSlots = extractSlotNames({
		titleBase: tpl.titleBase,
		shortObjectiveBase: tpl.shortObjectiveBase,
		descriptionBase: tpl.descriptionBase,
		agentPromptBase: tpl.agentPromptBase,
		objectivesBase: tpl.objectivesBase,
	});
	const missingSlots = getMissingSlots(slotValues, requiredSlots);
	if (missingSlots.length > 0) {
		return {
			error: `${prefix} is missing slot values: ${missingSlots.join(", ")}`,
			slotValues: undefined,
			openingState: undefined,
		};
	}

	return { error: undefined, slotValues, openingState: osValidation.data };
}

// ── JSON import/export ────────────────────────────────────────────────

const nullableString = z.string().nullable().optional();
const nullableStringArray = z.array(z.string()).nullable().optional();
const nullableNumber = z.number().int().min(0).nullable().optional();

const importedTemplateSchema = z
	.object({
		language: z.enum(LANGUAGE_CODES),
		interactionType: z.enum(INTERACTION_TYPES),
		ui: z.enum(UI_VARIANTS),
		cadence: z.enum(CADENCES),
		difficulty: z.number().int().min(1).max(3),
		maxTurns: nullableNumber,
		estimatedWords: nullableNumber,
		pointReward: z.number().int().min(0),
		gemReward: z.number().int().min(0),
		isActive: z.boolean().default(true),
		agentStartsFirst: z.boolean().default(true),
		titleBase: z.string().min(1, "Title is required"),
		shortObjectiveBase: nullableString,
		descriptionBase: nullableString,
		agentPromptBase: nullableString,
		materialsMd: nullableString,
		objectivesBase: nullableStringArray,
		translationBase: z.array(z.array(z.string())).nullable().optional(),
		tags: nullableStringArray,
	})
	.refine((data) => (data.interactionType === "translate") === (data.ui === "translator"), {
		message: 'UI must be "translator" when interaction type is "translate", and must not be "translator" otherwise',
		path: ["ui"],
	});

const importedVariantSchema = z.object({
	slotValues: z.record(z.string(), z.string()).default({}),
	openingState: z.record(z.string(), z.unknown()).default({}),
	isActive: z.boolean().default(true),
});

const templateJsonSchema = z.object({
	version: z.number().optional(),
	template: importedTemplateSchema,
	variants: z.array(importedVariantSchema).default([]),
});

export type TemplateJsonPayload = z.infer<typeof templateJsonSchema>;

type TemplateJsonParseResult = { success: false; error: string } | { success: true; data: TemplateJsonPayload };

export function parseTemplateJson(rawJson: string): TemplateJsonParseResult {
	let raw: unknown;
	try {
		raw = JSON.parse(rawJson);
	} catch {
		return { success: false, error: "Invalid JSON." };
	}

	const parsed = templateJsonSchema.safeParse(raw);
	if (!parsed.success) {
		return { success: false, error: z.prettifyError(parsed.error) };
	}

	const { template, variants } = parsed.data;
	if (template.interactionType === "translate") {
		if (variants.length > 0) return { success: false, error: "Translate templates cannot include variants." };
		return { success: true, data: parsed.data };
	}

	if (variants.length === 0) {
		return { success: false, error: "Imported non-translation templates must include at least one variant." };
	}
	if (!variants.some((variant) => variant.isActive)) {
		return { success: false, error: "Imported non-translation templates must include at least one active variant." };
	}

	for (const [index, variant] of variants.entries()) {
		const variantResult = prepareVariantPayload(template, variant.slotValues, variant.openingState, `Variant ${index + 1}`);
		if (variantResult.error !== undefined) return { success: false, error: variantResult.error };
		variant.openingState = variantResult.openingState;
		variant.slotValues = variantResult.slotValues;
	}

	return { success: true, data: parsed.data };
}
