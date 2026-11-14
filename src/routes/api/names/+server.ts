import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { error } from "@sveltejs/kit";
import { repoPath } from "#lib/server/paths.ts";
import type { NameTable } from "#model/translate/names.ts";
import { WORKS } from "#model/translate/works.ts";
import { dev } from "$app/env";

// The works' name tables (seed/names/<work>.<locale>.json, written by scripts/names.ts), for the admin to confirm.
// Dev only: in the main app this is the admin's, behind its auth.
const dir = () => repoPath("seed/names");
const file = (work: string, locale: string) => repoPath("seed/names", `${work}.${locale}.json`);
const safe = (s: unknown) => typeof s === "string" && /^[\w-]+$/.test(s);

export function GET() {
	if (!dev) error(404);
	const tables = readdirSync(dir())
		.filter((f) => f.endsWith(".json"))
		.map((f) => JSON.parse(readFileSync(repoPath("seed/names", f), "utf8")) as NameTable);
	return Response.json({ tables, works: WORKS });
}

export async function PUT({ request }) {
	if (!dev) error(404);
	const t = (await request.json()) as NameTable;
	if (!safe(t.work) || !safe(t.locale) || !Array.isArray(t.rows)) error(400);
	writeFileSync(file(t.work, t.locale), `${JSON.stringify(t, null, "\t")}\n`);
	return Response.json({ ok: true });
}
