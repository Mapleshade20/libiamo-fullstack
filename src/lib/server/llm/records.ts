import { createHash } from "node:crypto";
import { db } from "#lib/server/db/index.ts";
import { llmCall, llmPrompt } from "#lib/server/db/schema.ts";
import type { CallRecord, Recorder } from "./caller.ts";

/*
 * Model calls as `llm_call` rows, written after the fact and never awaited by the call. The numbers always; the
 * messages and the reply only while the learner helps improve Libiamo (`help_improve`). A system prompt is stored once
 * in `llm_prompt` and named by its hash.
 */
export type RecordScope = { userId: string | null; pieceId?: string | null; keepText: boolean };

export function recorder(scope: RecordScope): Recorder {
	return (r) => {
		write(scope, r).catch((e) => console.error("llm_call write failed:", e));
	};
}

async function write(scope: RecordScope, r: CallRecord) {
	const system = r.messages[0]?.role === "system" ? r.messages[0].content : null;
	const promptHash = system ? createHash("sha256").update(system).digest("hex").slice(0, 32) : null;
	if (system && promptHash && scope.keepText) await db.insert(llmPrompt).values({ hash: promptHash, text: system }).onConflictDoNothing();
	await db.insert(llmCall).values({
		userId: scope.userId,
		pieceId: scope.pieceId ?? null,
		stepSeq: r.step,
		purpose: r.purpose,
		tag: r.tag,
		provider: r.provider,
		model: r.model,
		effort: r.effort,
		state: r.state,
		background: r.background,
		promptHash,
		messages: scope.keepText ? (system ? r.messages.slice(1) : r.messages) : null,
		output: scope.keepText ? (r.output ?? null) : null,
		error: r.error ?? null,
		promptTokens: r.usage?.input ?? null,
		completionTokens: r.usage?.output ?? null,
		reasoningTokens: r.usage?.reasoning ?? null,
		cacheRead: r.usage?.cacheRead ?? null,
		cacheWrite: r.usage?.cacheWrite ?? null,
		costUsd: r.costUsd ?? null,
		latencyMs: r.ms ?? null,
	});
}
