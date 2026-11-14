import { z } from "zod";
import { NAME_KINDS, NAME_STATUSES } from "#lib/constants.ts";
import { admin } from "#lib/server/guard.ts";
import { saveNameTable, nameTables as tablesOf } from "#lib/server/translation/tables.ts";
import { command, query } from "$app/server";

/* The works' name tables, for the admin to confirm (only confirmed rows reach a translation's source). */
export const nameTables = query(async () => {
	admin();
	return tablesOf();
});

const Candidate = z.object({
	rendering: z.string().max(200),
	source: z.enum(["wikidata", "wikipedia", "wiki"]),
	url: z.string().max(2000),
	about: z.string().max(2000),
});
const Row = z.object({
	term: z.string().min(1).max(200),
	kind: z.enum(NAME_KINDS),
	rendering: z.string().max(200).nullable(),
	status: z.enum(NAME_STATUSES),
	origin: z.enum(["wikidata", "wikipedia", "wiki", "model", "admin", "none"]),
	url: z.string().max(2000).optional(),
	why: z.string().max(2000).optional(),
	candidates: z.array(Candidate).max(40).optional(),
});

export const saveNames = command(z.object({ work: z.string().max(60), locale: z.string().max(10), rows: z.array(Row).max(500) }), async (t) => {
	admin();
	await saveNameTable(t);
});
