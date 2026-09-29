/**
 * Beta: in group chats, a decision model infers whom a learner message that quotes and @mentions
 * nobody is for. It runs only on an OpenRouter BYOK key, billed to it; everyone else keeps the
 * name heuristic. The model (and its API) may change, so nothing outside `server/practice/addressee`
 * depends on it beyond this name.
 */
import type { ByokApiBaseUrl } from "$lib/constants";

export const ADDRESSEE_BETA_MODEL = "~typesafe/jev-latest";

const OPENROUTER: ByokApiBaseUrl = "https://openrouter.ai/api/v1";

/** Whether a BYOK key on this base URL gets the beta. */
export function hasAddresseeBeta(baseUrl: string | null | undefined): boolean {
	return baseUrl?.trim().replace(/\/+$/, "") === OPENROUTER;
}
