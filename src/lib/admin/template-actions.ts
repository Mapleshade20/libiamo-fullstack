/**
 * Shared helpers for admin template route actions.
 * Consolidates duplication between template "new" and "[id]" pages.
 */

import { extractSlotNames, getMissingSlots, parseJsonField, parseSlotValues } from "$lib/admin/variant-helpers";
import type { UiVariant } from "$lib/constants";
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
