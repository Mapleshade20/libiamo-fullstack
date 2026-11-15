import { z } from "zod";
import { FEEDBACK_KINDS } from "#lib/constants.ts";
import { sendFeedback as file } from "#lib/server/account/feedback.ts";
import { learner } from "#lib/server/guard.ts";
import { command, getRequestEvent } from "$app/server";

/* Feedback about Libiamo, from the account menu's page. */
export const sendFeedback = command(
	z.object({ kind: z.enum(FEEDBACK_KINDS), text: z.string().trim().min(1).max(10_000), page: z.string().max(500).optional() }),
	async (input) => {
		const u = learner();
		const browser = getRequestEvent().request.headers.get("user-agent")?.slice(0, 500) ?? undefined;
		await file(u.id, { ...input, browser });
	},
);
