import { eq } from "drizzle-orm";
import { decisionModelFor, graderFor, RECOMMENDED } from "#lib/llm/providers.ts";
import { decryptKey } from "#lib/server/account/key.ts";
import { db } from "#lib/server/db/index.ts";
import { userKey } from "#lib/server/db/schema.ts";
import { LLM_CACHE_DIR, LLM_CACHE_ONLY, OPENROUTER_API_KEY } from "$app/env/private";
import { fileCache, type ModelCache } from "./cache.ts";
import { Caller } from "./caller.ts";
import type { Lanes } from "./lanes.ts";
import { recorder } from "./records.ts";
import type { Route } from "./transport.ts";

/*
 * Who pays. A learner's calls run on their own key and nothing else: without one they stop with "nokey". The service's
 * key (OPENROUTER_API_KEY) pays only for what no learner asks for. In development a cache may answer first
 * (LLM_CACHE_DIR; LLM_CACHE_ONLY for replays, which must never reach a provider).
 */
const cache: ModelCache | undefined = LLM_CACHE_DIR ? fileCache(LLM_CACHE_DIR, LLM_CACHE_ONLY) : undefined;

/** The learner's saved key as a route, or null when there is none (or it no longer decrypts). */
export async function routeOf(userId: string): Promise<Route | null> {
	return (await keyOf(userId))?.route ?? null;
}
async function keyOf(userId: string): Promise<{ route: Route; decision: string | null } | null> {
	const row = await db.query.userKey.findFirst({ where: eq(userKey.userId, userId) });
	if (!row) return null;
	const provider = row.provider as Route["provider"];
	try {
		return { route: { provider, model: row.model, apiKey: decryptKey(row.encryptedKey) }, decision: decisionModelFor(provider, row.decisionModel) };
	} catch {
		// A key saved under another BETTER_AUTH_SECRET: as good as none, and the page leads to the key form.
		return null;
	}
}

export type LearnerScope = {
	user: { id: string; helpImprove: boolean };
	pieceId?: string | null;
	lanes?: Lanes;
	step?: () => number | null;
	/** Ask the provider even when the development cache holds the request. */
	fresh?: boolean;
};
export async function learnerCaller(scope: LearnerScope): Promise<Caller> {
	const key = await keyOf(scope.user.id);
	const route = key?.route ?? null;
	return new Caller({
		route,
		grader: route ? graderFor(route.provider, route.model) : undefined,
		decision: key?.decision,
		lanes: scope.lanes,
		cache,
		fresh: scope.fresh,
		step: scope.step,
		record: recorder({ userId: scope.user.id, pieceId: scope.pieceId, keepText: scope.user.helpImprove }),
	});
}

/**
 * The service's own OpenRouter key, for the calls no learner makes (translation sources and name tables, Scene Lab).
 * Recorded with no learner and with their text; without the key every call stops with "nokey".
 */
export function serviceCaller(model: string = RECOMMENDED.model): Caller {
	return new Caller({
		route: OPENROUTER_API_KEY ? { provider: "openrouter", model, apiKey: OPENROUTER_API_KEY } : null,
		grader: graderFor("openrouter", model),
		cache,
		record: recorder({ userId: null, keepText: true }),
	});
}
