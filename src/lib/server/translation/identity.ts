import { createHash } from "node:crypto";
import { z } from "zod";
import { TranslationVersion } from "#lib/scenario/versions.ts";

export const sourceIdentity = (version: TranslationVersion, workId: string | null) =>
	createHash("sha256")
		.update(JSON.stringify([workId, TranslationVersion.parse(version)]))
		.digest("hex");

/** A draft's immutable assignment, including the original that is never sent to its sheet. */
export const Assignment = z.object({
	version: TranslationVersion,
	language: z.string(),
	native: z.string(),
	sourceId: z.uuid(),
	generation: z.uuid(),
	title: z.string(),
	minutes: z.number().int().positive(),
	publishedAt: z.number(),
	source: z.string(),
	glossary: z.array(z.object({ term: z.string(), shown: z.string(), gloss: z.string() })),
});
export type Assignment = z.infer<typeof Assignment>;
