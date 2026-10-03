import { eq } from "drizzle-orm";
import { db } from "$lib/server/db";
import { llmTraceOptOut } from "$lib/server/db/schema";

/** Whether a learner turned trace capture off. It only takes effect while they have their own API key. */
export async function hasTraceOptOut(userId: string): Promise<boolean> {
	const row = await db.query.llmTraceOptOut.findFirst({ where: eq(llmTraceOptOut.userId, userId), columns: { userId: true } });
	return Boolean(row);
}

/** Opting out stops capture only; existing traces expire with retention. */
export async function setTraceOptOut(userId: string, optedOut: boolean) {
	if (optedOut) await db.insert(llmTraceOptOut).values({ userId }).onConflictDoNothing();
	else await db.delete(llmTraceOptOut).where(eq(llmTraceOptOut.userId, userId));
}
