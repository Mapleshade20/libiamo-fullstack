import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Effort, Message, Reply } from "./transport.ts";

/*
 * A store of model replies by request, for development only: replays (lab/replay.mjs) and tests answer from it so
 * nothing is spent and a difference is a change in the code. Production has none. The key is the request as sent:
 * model, effort, sample, messages.
 */
export type CacheKey = { model: string; effort: Effort; sample: number; messages: Message[]; tag: string };
export type ModelCache = {
	get(k: CacheKey): Reply | null;
	put(k: CacheKey, reply: Reply): void;
	/** A request it does not hold is an error rather than a call (a replay must never reach a provider). */
	readonly only: boolean;
};

export const cacheHash = (k: CacheKey) =>
	createHash("sha256")
		.update(JSON.stringify({ model: k.model, effort: k.effort, sample: k.sample, messages: k.messages }))
		.digest("hex")
		.slice(0, 24);

/** One JSON file per reply, under the call's tag: `<dir>/<tag>/<hash>.json`. */
export function fileCache(dir: string, only = false): ModelCache {
	const file = (k: CacheKey) => join(dir, k.tag.replaceAll("/", "_"), `${cacheHash(k)}.json`);
	return {
		only,
		get(k) {
			const f = file(k);
			if (!existsSync(f)) return null;
			const hit = JSON.parse(readFileSync(f, "utf8"));
			return { text: hit.result.text, usage: hit.result.usage, ms: hit.result.ms, costUsd: hit.result.costUsd, finish: hit.finish ?? null };
		},
		put(k, reply) {
			const f = file(k);
			mkdirSync(dirname(f), { recursive: true });
			const { text, usage, ms, costUsd } = reply;
			writeFileSync(
				f,
				JSON.stringify(
					{ model: k.model, effort: k.effort, sample: k.sample, messages: k.messages, result: { text, usage, ms, costUsd }, finish: reply.finish },
					null,
					"\t",
				),
			);
		},
	};
}
