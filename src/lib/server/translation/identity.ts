import { createHash } from "node:crypto";
import { z } from "zod";
import { TranslationVersion } from "#lib/scenario/versions.ts";

/**
 * What a source was made from: the whole version and its work. A list added to the version later is left out while it
 * is empty, so its arrival does not make every source in production stale (and hidden) at once.
 */
export const sourceIdentity = (version: z.input<typeof TranslationVersion>, workId: string | null) => {
	const { leaveOut, ...rest } = TranslationVersion.parse(version);
	return createHash("sha256")
		.update(JSON.stringify([workId, leaveOut.length ? { ...rest, leaveOut } : rest]))
		.digest("hex");
};

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
