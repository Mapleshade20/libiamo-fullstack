import { z } from "zod";
import { CASE_STATUSES } from "#lib/constants.ts";
import { cases, openCase, sessionOf, sessions, setCase } from "#lib/server/admin/sessions.ts";
import { admin } from "#lib/server/guard.ts";
import { command, query } from "$app/server";
import { waiting } from "./admin.remote.ts";

/* Session records and cases, for the admin. */
export const sessionList = query(async () => {
	admin();
	return sessions();
});

export const sessionOne = query(z.string().uuid(), async (id) => {
	admin();
	return sessionOf(id);
});

export const caseList = query(async () => {
	admin();
	return cases();
});

/** A flag on a step: the session becomes a case, and its calls are kept while the case is open. */
export const flagStep = command(
	z.object({ pieceId: z.string().uuid(), stepSeq: z.number().int(), note: z.string().trim().min(1).max(4000) }),
	async (input) => {
		const u = admin();
		const id = await openCase(input.pieceId, input.stepSeq, input.note, u.id);
		await Promise.all([sessionOne(input.pieceId).refresh(), caseList().refresh(), waiting().refresh()]);
		return id;
	},
);

export const setCaseStatus = command(
	z.object({ id: z.number().int(), status: z.enum(CASE_STATUSES), commit: z.string().trim().max(40).nullable() }),
	async ({ id, status, commit }) => {
		admin();
		await setCase(id, status, commit || null);
		await Promise.all([caseList().refresh(), waiting().refresh()]);
	},
);
