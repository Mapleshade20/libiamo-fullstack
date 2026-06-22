import { parseTemplateJson, type TemplateJsonPayload } from "$lib/admin/template-actions";

export type ExistingTemplateImportVariant = {
	id: number;
	slotValues: unknown;
};

export type TemplateImportPreviewStatus = "Edited" | "Created" | "Deactivated";

export type TemplateImportPreviewItem = {
	id: number | null;
	title: string;
	status: TemplateImportPreviewStatus;
};

export type TemplateImportPreviewResult =
	| { ok: false; error: string }
	| { ok: true; payload: TemplateJsonPayload; items: TemplateImportPreviewItem[] };

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function summarizeSlotValues(slotValues: unknown): string {
	if (!isRecord(slotValues)) return "No slot values";

	const entries = Object.entries(slotValues);
	if (entries.length === 0) return "No slot values";

	const visibleEntries = entries.slice(0, 3).map(([key, value]) => `${key}: ${String(value)}`);
	const remainingCount = entries.length - visibleEntries.length;
	return remainingCount > 0 ? `${visibleEntries.join(" · ")} · +${remainingCount} more` : visibleEntries.join(" · ");
}

export function buildTemplateImportPreview(rawJson: string, existingVariants: ExistingTemplateImportVariant[]): TemplateImportPreviewResult {
	const parsed = parseTemplateJson(rawJson);
	if (!parsed.success) return { ok: false, error: parsed.error };

	const existingVariantIds = new Set(existingVariants.map((variant) => variant.id));
	const importedVariantIds = parsed.data.variants
		.map((variant) => variant.id)
		.filter((variantId): variantId is number => typeof variantId === "number");
	const uniqueImportedVariantIds = new Set(importedVariantIds);

	if (uniqueImportedVariantIds.size !== importedVariantIds.length) {
		return { ok: false, error: "Imported JSON contains duplicate variant ids." };
	}

	for (const variantId of importedVariantIds) {
		if (!existingVariantIds.has(variantId)) {
			return {
				ok: false,
				error: `Variant #${variantId} does not belong to this template. Remove variant ids to import them as new variants.`,
			};
		}
	}

	const items: TemplateImportPreviewItem[] = parsed.data.variants.map((variant) => ({
		id: variant.id ?? null,
		title: summarizeSlotValues(variant.slotValues),
		status: variant.id === undefined ? "Created" : "Edited",
	}));

	for (const existingVariant of existingVariants) {
		if (uniqueImportedVariantIds.has(existingVariant.id)) continue;
		items.push({
			id: existingVariant.id,
			title: summarizeSlotValues(existingVariant.slotValues),
			status: "Deactivated",
		});
	}

	return { ok: true, payload: parsed.data, items };
}
