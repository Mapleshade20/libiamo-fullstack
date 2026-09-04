import { json } from "@sveltejs/kit";
import { getBrowserTimezone } from "$lib/server/browser-timezone";
import { getQuestHallPreparation, QuestHallPreparationRequestError } from "$lib/server/quest-hall-preparation";
import type { RequestHandler } from "./$types";

const PRIVATE_JSON = { "cache-control": "private, no-store" };

export const GET: RequestHandler = async (event) => {
	const user = event.locals.user;
	if (!user) return json({ error: "Unauthorized" }, { status: 401, headers: PRIVATE_JSON });

	const key = event.url.searchParams.get("task") ?? "";
	const editionDate = event.url.searchParams.get("edition") ?? "";
	try {
		const preparation = await getQuestHallPreparation({
			user,
			key,
			editionDate,
			browserTimezone: getBrowserTimezone(event.cookies),
		});
		if (!preparation) return json({ error: "Preparation not found" }, { status: 404, headers: PRIVATE_JSON });
		return json({ preparation }, { headers: PRIVATE_JSON });
	} catch (cause) {
		if (cause instanceof QuestHallPreparationRequestError) return json({ error: cause.message }, { status: cause.status, headers: PRIVATE_JSON });
		console.error("Failed to load Quest Hall preparation:", cause);
		return json({ error: "Failed to load preparation" }, { status: 500, headers: PRIVATE_JSON });
	}
};
