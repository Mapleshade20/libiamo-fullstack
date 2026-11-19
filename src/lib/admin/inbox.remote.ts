import { z } from "zod";
import { EXCHANGE_PLACES } from "#lib/constants.ts";
import { inbox as inboxOf, markFeedback, setAside } from "#lib/server/admin/inbox.ts";
import { scenarioFromSuggestion } from "#lib/server/admin/scenarios.ts";
import { admin } from "#lib/server/guard.ts";
import { command, query } from "$app/server";
import { waiting } from "./admin.remote.ts";

/* The admin's inbox: suggested situations and feedback. */
export const inbox = query(async () => {
	admin();
	return inboxOf();
});

export const setSuggestionAside = command(z.object({ id: z.string().uuid(), reason: z.string().trim().min(1).max(500) }), async ({ id, reason }) => {
	admin();
	await setAside(id, reason);
	await Promise.all([inbox().refresh(), waiting().refresh()]);
});

/** Makes a draft scenario of a suggestion and answers its id (the page opens it); one from elsewhere names its place. */
export const makeScenario = command(z.object({ id: z.uuid(), place: z.enum(EXCHANGE_PLACES).optional() }), async ({ id, place }) => {
	const u = admin();
	const scenarioId = await scenarioFromSuggestion(id, u.id, place);
	await Promise.all([inbox().refresh(), waiting().refresh()]);
	return scenarioId;
});

export const markFeedbackDone = command(z.object({ id: z.string().uuid(), done: z.boolean() }), async ({ id, done }) => {
	admin();
	await markFeedback(id, done);
	await Promise.all([inbox().refresh(), waiting().refresh()]);
});
