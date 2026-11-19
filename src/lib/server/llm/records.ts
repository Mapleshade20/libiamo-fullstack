import { createHash } from "node:crypto";
import { and, eq, lt, not, sql } from "drizzle-orm";
import { db } from "#lib/server/db/index.ts";
import { llmCall, llmPrompt, sessionCase, user } from "#lib/server/db/schema.ts";
import type { CallRecord, Recorder } from "./caller.ts";

/*
 * Model calls as `llm_call` rows, written after the fact and never awaited by the call. The numbers always; the
 * messages and the reply only while the learner helps improve Libiamo (`help_improve`). A system prompt is stored once
 * in `llm_prompt` and named by its hash.
 */
export type RecordScope = { userId: string | null; pieceId?: string | null; keepText: boolean };

export function recorder(scope: RecordScope): Recorder {
	return (r) => {
		writeRecord(scope, r).catch((e) => console.error("llm_call write failed:", e));
	};
}

export async function writeRecord(scope: RecordScope, r: CallRecord) {
	await db.transaction(async (tx) => {
		// Privacy can change while a model is answering, or while a revision stays in memory.
		const owner = scope.userId ? (await tx.select({ keep: user.helpImprove }).from(user).where(eq(user.id, scope.userId)).for("share"))[0] : null;
		if (scope.userId && !owner) return;
		const keepText = owner ? owner.keep : scope.keepText;
		const system = r.messages[0]?.role === "system" ? r.messages[0].content : null;
		const promptHash =
			system && keepText
				? createHash("sha256")
						.update(JSON.stringify([scope.userId, system]))
						.digest("hex")
						.slice(0, 32)
				: null;
		// Upserted, not ignored on conflict: the row stays locked until the call naming it commits, so `pruneCalls` passes
		// over it rather than deleting a prompt that is about to be referenced again.
		if (system && promptHash)
			await tx
				.insert(llmPrompt)
				.values({ hash: promptHash, userId: scope.userId, text: system })
				.onConflictDoUpdate({ target: llmPrompt.hash, set: { hash: sql`excluded.hash` } });
		await tx.insert(llmCall).values({
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
			messages: keepText ? (system ? r.messages.slice(1) : r.messages) : null,
			output: keepText ? (r.output ?? null) : null,
			error: keepText ? (r.error ?? null) : null,
			promptTokens: r.usage?.input ?? null,
			completionTokens: r.usage?.output ?? null,
			reasoningTokens: r.usage?.reasoning ?? null,
			cacheRead: r.usage?.cacheRead ?? null,
			cacheWrite: r.usage?.cacheWrite ?? null,
			costUsd: r.costUsd ?? null,
			latencyMs: r.ms ?? null,
		});
	});
}

/**
 * A call's record is kept thirty days (design §5.7), then goes, words and numbers alike, unless an open case holds its
 * piece: those stay until the case is closed.
 */
export const KEEP_CALLS_DAYS = 30;
export async function pruneCalls(now = new Date()) {
	const before = new Date(now.getTime() - KEEP_CALLS_DAYS * 86_400_000);
	const held = sql`exists (select 1 from ${sessionCase} where ${sessionCase.pieceId} = ${llmCall.pieceId} and ${sessionCase.status} = 'open')`;
	const gone = await db
		.delete(llmCall)
		.where(and(lt(llmCall.createdAt, before), not(held)))
		.returning({ id: llmCall.id });
	// A prompt a record is being written with is locked (`writeRecord`) and skipped. One whose record committed between
	// this statement's start and its lock still looks unreferenced and fails the foreign key: the next round takes it.
	try {
		await db.execute(sql`
			delete from ${llmPrompt} where ${llmPrompt.hash} in (
				select p.hash from ${llmPrompt} p
				where not exists (select 1 from ${llmCall} where ${llmCall.promptHash} = p.hash)
				for update skip locked
			)`);
	} catch (e) {
		const code = (e as { code?: string; cause?: { code?: string } }).cause?.code ?? (e as { code?: string }).code;
		if (code !== "23503") throw e;
	}
	return gone.length;
}
