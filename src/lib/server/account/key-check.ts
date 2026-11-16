import type { KeyProvider } from "#lib/constants.ts";
import { PROVIDERS } from "#lib/llm/providers.ts";

/*
 * A key is tried before it is saved: one chat request for a single token, on the key and model the learner gave, so a
 * wrong key, a key without credit or a model the provider does not run is said at once instead of at the first
 * revision. It is not a model call of the app's (no Caller, nothing recorded): the key is not saved yet, and the
 * request carries nothing of the learner's.
 */
const TIMEOUT_MS = 10_000;
/** How the providers say the model is not theirs ("is not a valid model ID", "Model Not Exist", "模型不存在"). */
const UNKNOWN_MODEL = /model\b.*\b(not|invalid|unknown|exist)|\b(invalid|unknown|not a valid|no such)\b.*\bmodel|模型不存在/i;

/** Why a key cannot be saved, as the page's catalog names it. */
export type KeyProblem = "setKeyRefused" | "setKeyCredit" | "setKeyModel" | "setKeyUnreachable" | "setKeyOther";
export type KeyCheck = { ok: true } | { ok: false; problem: KeyProblem; detail?: string };

/** The provider's own words about a failed request (OpenAI's error shape, or the start of the body). */
function errorText(body: string) {
	try {
		const v = JSON.parse(body) as { error?: { message?: unknown } | string; message?: unknown };
		const m = typeof v.error === "string" ? v.error : (v.error?.message ?? v.message);
		if (typeof m === "string" && m.trim()) return m.trim().slice(0, 200);
	} catch {}
	return body.trim().slice(0, 200);
}

export async function checkKey(provider: KeyProvider, model: string, key: string): Promise<KeyCheck> {
	let r: Response;
	try {
		r = await fetch(`${PROVIDERS[provider].baseURL.replace(/\/$/, "")}/chat/completions`, {
			method: "POST",
			headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
			body: JSON.stringify({ model, messages: [{ role: "user", content: "Hi" }], max_tokens: 1 }),
			signal: AbortSignal.timeout(TIMEOUT_MS),
		});
	} catch {
		return { ok: false, problem: "setKeyUnreachable" };
	}
	// A key that is only being held back for a moment is a working key.
	if (r.ok || r.status === 429) return { ok: true };
	const said = errorText(await r.text().catch(() => ""));
	if (r.status === 401 || r.status === 403) return { ok: false, problem: "setKeyRefused" };
	if (r.status === 402) return { ok: false, problem: "setKeyCredit" };
	// OpenAI answers an unknown model with 404; OpenRouter, DeepSeek and GLM with a 400 that names it.
	if (r.status === 404 || (r.status === 400 && UNKNOWN_MODEL.test(said))) return { ok: false, problem: "setKeyModel" };
	if (r.status >= 500) return { ok: false, problem: "setKeyUnreachable" };
	return { ok: false, problem: "setKeyOther", detail: said || `HTTP ${r.status}` };
}
