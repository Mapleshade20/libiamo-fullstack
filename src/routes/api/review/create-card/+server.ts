import { json } from "@sveltejs/kit";
import { reviewCreateCardSchema } from "$lib/schemas";
import { consumePendingQuotaNotice, TrialQuotaExhaustedError, trialQuotaExhaustedData } from "$lib/server/llm";
import { createCardFromNote } from "$lib/server/review-cards";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async (event) => {
	const user = event.locals.user;
	if (!user) {
		return json({ error: "Unauthorized" }, { status: 401 });
	}

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return json({ error: "Invalid JSON body" }, { status: 400 });
	}

	const parsed = reviewCreateCardSchema.safeParse(body);
	if (!parsed.success) {
		return json({ error: "Invalid request", details: parsed.error.issues }, { status: 400 });
	}

	try {
		const result = await createCardFromNote(parsed.data.noteId, user.id);
		return json({ ...result, quotaNotice: await consumePendingQuotaNotice(user.id) });
	} catch (error) {
		if (error instanceof TrialQuotaExhaustedError) {
			return json(trialQuotaExhaustedData(error), { status: 402 });
		}
		if (error instanceof Error && error.message === "Note not found") {
			return json({ error: "Note not found" }, { status: 404 });
		}
		console.error("Failed to create review card:", error);
		return json({ error: "Failed to create review card" }, { status: 500 });
	}
};
