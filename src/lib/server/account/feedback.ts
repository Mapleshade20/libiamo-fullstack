import type { FeedbackKind } from "#lib/constants.ts";
import { db } from "#lib/server/db/index.ts";
import { feedback } from "#lib/server/db/schema.ts";

/* Feedback about Libiamo itself, filed with the page and the browser it came from; the admin's inbox reads it. */
export async function sendFeedback(userId: string, input: { kind: FeedbackKind; text: string; page?: string; browser?: string }) {
	await db.insert(feedback).values({ userId, kind: input.kind, text: input.text, page: input.page ?? null, browser: input.browser ?? null });
}
