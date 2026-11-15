import { count, eq, inArray, isNull } from "drizzle-orm";
import { db } from "#lib/server/db/index.ts";
import { feedback, scenarioSource, sessionCase, suggestion } from "#lib/server/db/schema.ts";

/* What waits on the admin, for the counts beside the admin sections. */
export async function waitingCounts() {
	const [[sources], [sug], [fb], [cases]] = await Promise.all([
		db
			.select({ n: count() })
			.from(scenarioSource)
			.where(inArray(scenarioSource.state, ["notes", "failed"])),
		db.select({ n: count() }).from(suggestion).where(eq(suggestion.status, "pending")),
		db.select({ n: count() }).from(feedback).where(isNull(feedback.doneAt)),
		db.select({ n: count() }).from(sessionCase).where(eq(sessionCase.status, "open")),
	]);
	return { scenarios: sources.n, inbox: sug.n + fb.n, cases: cases.n };
}
