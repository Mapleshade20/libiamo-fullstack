import { json } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { USER_TEXT_MAX_LENGTH } from "$lib/constants";
import { db } from "$lib/server/db";
import { reviewCard, reviewLog } from "$lib/server/db/schema";
import type { RequestHandler } from "./$types";

export const DELETE: RequestHandler = async (event) => {
	const user = event.locals.user;
	if (!user) return json({ error: "Unauthorized" }, { status: 401 });

	const cardId = Number(event.params.cardId);
	if (Number.isNaN(cardId)) return json({ error: "Invalid card ID" }, { status: 400 });

	const card = await db.query.reviewCard.findFirst({
		where: eq(reviewCard.id, cardId),
		columns: { userId: true },
	});

	if (!card || card.userId !== user.id) return json({ error: "Not found" }, { status: 404 });

	await db.delete(reviewLog).where(eq(reviewLog.cardId, cardId));
	await db.delete(reviewCard).where(eq(reviewCard.id, cardId));

	return json({ ok: true });
};

const updateSchema = z.object({
	front: z.string().min(1).max(USER_TEXT_MAX_LENGTH),
	back: z.string().min(1).max(USER_TEXT_MAX_LENGTH),
});

export const PATCH: RequestHandler = async (event) => {
	const user = event.locals.user;
	if (!user) return json({ error: "Unauthorized" }, { status: 401 });

	const cardId = Number(event.params.cardId);
	if (Number.isNaN(cardId)) return json({ error: "Invalid card ID" }, { status: 400 });

	const card = await db.query.reviewCard.findFirst({
		where: eq(reviewCard.id, cardId),
		columns: { userId: true },
	});

	if (!card || card.userId !== user.id) return json({ error: "Not found" }, { status: 404 });

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return json({ error: "Invalid JSON" }, { status: 400 });
	}

	const parsed = updateSchema.safeParse(body);
	if (!parsed.success) return json({ error: parsed.error.issues }, { status: 400 });

	await db.update(reviewCard).set({ front: parsed.data.front, back: parsed.data.back }).where(eq(reviewCard.id, cardId));

	return json({ ok: true });
};
