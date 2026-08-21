import { randomUUID } from "node:crypto";
import { and, asc, sql as drizzleSql, eq, inArray, lte, ne, type SQL } from "drizzle-orm";
import { getDeliveryDelayMs, RE_ENGAGE_DELAY_MS } from "$lib/async-replies/timing";
import { URGENCY_PRESETS, type Urgency } from "$lib/constants";
import { AgentGenerationError, generateAgentResponse } from "$lib/server/async-replies/generator";
import { db } from "$lib/server/db";
import { agentDelivery, agentResponseBatch, practiceSession, sessionMessage } from "$lib/server/db/schema";

export const DEFAULT_WORKER_SCAN_INTERVAL_MS = 1_000;
export const DEFAULT_WORKER_LEASE_MS = 30_000;
export const DEFAULT_WORKER_CONCURRENCY = 2;
export const DEFAULT_WORKER_RETRY_BACKOFF_MS = 60_000;
export const MAX_GENERATION_ATTEMPTS = 3;

type WorkerNow = Date;

type ClaimedBatch = typeof agentResponseBatch.$inferSelect;
type AsyncReplyExecutor = Pick<typeof db, "query" | "update" | "insert">;

export function getDeliveryDueAt(firstDueAt: Date, previousContent: string | undefined): Date {
	return new Date(firstDueAt.getTime() + (previousContent === undefined ? 0 : getDeliveryDelayMs(previousContent)));
}

export function isStaleGeneration(input: { expectedInputMessageId: number | null; latestUserMessageId: number | null; sessionStatus: string }) {
	return (
		input.sessionStatus !== "in_progress" ||
		(input.expectedInputMessageId !== null && input.latestUserMessageId !== null && input.latestUserMessageId > input.expectedInputMessageId)
	);
}

export function shouldRetryGeneration(generationCount: number): boolean {
	return generationCount < MAX_GENERATION_ATTEMPTS;
}

/**
 * True when the turn limit (not the user, an expiry, or abuse termination) ended
 * the session. Replies still flow into such sessions: the agent had every
 * intention of answering the burst when the limit cut things off.
 */
export function hasEndedByMaxTurns(session: { status: string; completionReason: string | null } | null | undefined): boolean {
	// "evaluated" is the same lifecycle one step on: the feedback page can flip the
	// status while a spared batch is still generating, and the reply must land anyway.
	return (session?.status === "completed" || session?.status === "evaluated") && session.completionReason === "max_turns";
}

/**
 * A reply the agent already composed when the turn-limit message landed is still
 * delivered into the completed session; every other ended session (user
 * requested, expired, abuse) cancels outstanding deliveries.
 */
export function shouldDeliverIntoEndedSession(
	session: { status: string; completionReason: string | null } | null | undefined,
	batchStatus: string,
): boolean {
	if (session?.status === "in_progress") return true;
	return hasEndedByMaxTurns(session) && batchStatus === "delivery_pending";
}

function safeError(error: unknown): string {
	return error instanceof Error && error.message.trim() ? error.message.slice(0, 500) : "The AI reply could not be generated.";
}

/**
 * Comment-thread metadata stored on a user message at send time
 * (`{ commentId, responderName, ... }` for AO3/Reddit turns).
 */
export function getThreadMetadataFromMessage(llmMetadata: unknown): { commentId?: string; responderName?: string } | null {
	if (!llmMetadata || typeof llmMetadata !== "object") return null;
	const thread = (llmMetadata as { thread?: unknown }).thread;
	if (!thread || typeof thread !== "object") return null;
	const commentId = (thread as { commentId?: unknown }).commentId;
	const responderName = (thread as { responderName?: unknown }).responderName;
	const commentIdStr = typeof commentId === "string" && commentId.trim() ? commentId.trim() : undefined;
	const responderStr = typeof responderName === "string" && responderName.trim() ? responderName.trim() : undefined;
	return commentIdStr || responderStr ? { commentId: commentIdStr, responderName: responderStr } : null;
}

/**
 * Presentation metadata for a delivered reply on threaded surfaces (AO3/Reddit):
 * the reply must nest under the comment it answers and carry the responder's
 * name, exactly like the synchronous path (`buildAo3SendOptions`). Linear
 * surfaces (iMessage/Discord/Mail) store no thread metadata and stay unchanged.
 */
export function buildDeliveredReplyMetadata(
	thread: { commentId?: string; responderName?: string } | null,
	replyToMessageId: number | null,
): Record<string, unknown> {
	return {
		...(thread
			? {
					...(thread.responderName ? { assistantAuthorName: thread.responderName } : {}),
					thread: {
						parentCommentId: thread.commentId ?? null,
						...(thread.responderName ? { responderName: thread.responderName } : {}),
						mode: "reply",
					},
				}
			: {}),
		replyToMessageId,
		asyncDelivery: true,
	};
}

export function getUrgencyFollowUpAt(now: Date, urgency: Urgency, followUpCount: number): Date {
	return new Date(now.getTime() + URGENCY_PRESETS[urgency].idleFollowUpDelayMs * Math.max(1, followUpCount));
}

/** Instruction injected only into idle follow-up generations so the agent knows
 * the user has gone quiet and how many nudges remain. Reply batches get none. */
export function getBatchGenerationInstruction(kind: string, followUpCount: number): string | undefined {
	if (kind !== "follow_up") return undefined;
	const ordinal =
		followUpCount >= 2 ? "This is your final follow-up; afterwards you stay silent." : "At most one more follow-up may ever be sent after this one.";
	return `The user has gone quiet since your last message. If you are genuinely still waiting on an answer (for example you asked a question or proposed a plan), send one short, natural follow-up that fits your persona; do not repeat your previous wording and do not pressure them. If the conversation has naturally wound down, choose no_reply. ${ordinal}`;
}

export type AsyncReplyWorkerOptions = {
	workerId?: string;
	leaseMs?: number;
	scanIntervalMs?: number;
	concurrency?: number;
	retryBackoffMs?: number;
};

export class AsyncReplyWorker {
	private readonly workerId: string;
	private readonly leaseMs: number;
	private readonly scanIntervalMs: number;
	private readonly concurrency: number;
	private readonly retryBackoffMs: number;
	private timer: ReturnType<typeof setInterval> | undefined;
	private schedulerTick: Promise<void> | undefined;
	private readonly activeGenerations = new Set<Promise<void>>();
	private stopping = false;

	constructor(options: AsyncReplyWorkerOptions = {}) {
		this.workerId = options.workerId ?? `async-replies-${randomUUID()}`;
		this.leaseMs = options.leaseMs ?? DEFAULT_WORKER_LEASE_MS;
		this.scanIntervalMs = options.scanIntervalMs ?? DEFAULT_WORKER_SCAN_INTERVAL_MS;
		this.concurrency = options.concurrency ?? DEFAULT_WORKER_CONCURRENCY;
		this.retryBackoffMs = options.retryBackoffMs ?? DEFAULT_WORKER_RETRY_BACKOFF_MS;
	}

	get id() {
		return this.workerId;
	}

	async runOnce(now: WorkerNow = new Date()): Promise<void> {
		await this.expireSessions(now);
		await this.reclaimExpiredLeases(now);

		const claimed: ClaimedBatch[] = [];
		for (let index = 0; index < this.concurrency; index += 1) {
			const batch = await this.claimDueBatch(now);
			if (!batch) break;
			claimed.push(batch);
		}

		await Promise.all(claimed.map((batch) => this.processBatch(batch, now)));
		await this.deliverDueMessages(now);
	}

	start(): void {
		if (this.timer) return;
		this.stopping = false;
		this.timer = setInterval(() => {
			this.scheduleTick();
		}, this.scanIntervalMs);
		this.scheduleTick();
	}

	async stop(): Promise<void> {
		this.stopping = true;
		if (this.timer) clearInterval(this.timer);
		this.timer = undefined;
		await this.schedulerTick;
		await Promise.allSettled([...this.activeGenerations]);
	}

	/** Runs short scheduler scans without letting slow generations overlap the configured global concurrency. */
	private scheduleTick(): void {
		if (this.stopping || this.schedulerTick) return;
		const settled = this.runScheduledTick()
			.catch((error) => console.error("async reply worker tick failed", error))
			.finally(() => {
				if (this.schedulerTick === settled) this.schedulerTick = undefined;
			});
		this.schedulerTick = settled;
	}

	private async runScheduledTick(now: WorkerNow = new Date()): Promise<void> {
		await this.expireSessions(now);
		await this.reclaimExpiredLeases(now);
		await this.deliverDueMessages(now);

		while (!this.stopping && this.activeGenerations.size < this.concurrency) {
			const batch = await this.claimDueBatch(now);
			if (!batch) break;
			let generation!: Promise<void>;
			generation = this.processBatch(batch, now)
				.catch((error) => console.error("async reply worker generation failed", error))
				.finally(() => this.activeGenerations.delete(generation));
			this.activeGenerations.add(generation);
		}
	}

	/** Only the worker that currently holds the claim may write batch results. */
	private batchClaimFence(batch: ClaimedBatch): SQL {
		const claimToken = batch.claimToken ?? "";
		return and(
			eq(agentResponseBatch.id, batch.id),
			eq(agentResponseBatch.claimToken, claimToken),
			eq(agentResponseBatch.status, "processing"),
		) as SQL;
	}

	/** Extends the lease while a generation is in flight so live work is never reclaimed. */
	private startHeartbeat(batch: ClaimedBatch): () => void {
		const intervalMs = Math.max(Math.floor(this.leaseMs / 3), 1_000);
		const timer = setInterval(() => {
			void db
				.update(agentResponseBatch)
				.set({ leaseExpiresAt: new Date(Date.now() + this.leaseMs) })
				.where(this.batchClaimFence(batch))
				.catch((error) => console.error("async reply worker heartbeat failed", error));
		}, intervalMs);
		return () => clearInterval(timer);
	}

	private async expireSessions(now: WorkerNow): Promise<void> {
		const expired = await db
			.update(practiceSession)
			.set({ status: "completed", completionReason: "max_session_age", completedAt: now })
			.where(and(eq(practiceSession.status, "in_progress"), lte(practiceSession.expiresAt, now)))
			.returning({ id: practiceSession.id });

		if (expired.length === 0) return;
		const sessionIds = expired.map((session) => session.id);
		await db
			.update(agentResponseBatch)
			.set({ status: "cancelled", completedAt: now })
			.where(
				and(
					inArray(agentResponseBatch.sessionId, sessionIds),
					inArray(agentResponseBatch.status, ["pending", "processing", "stale", "delivery_pending"]),
				),
			);
		const batchIds = await db.select({ id: agentResponseBatch.id }).from(agentResponseBatch).where(inArray(agentResponseBatch.sessionId, sessionIds));
		if (batchIds.length > 0) {
			await db
				.update(agentDelivery)
				.set({ status: "cancelled" })
				.where(
					and(
						inArray(
							agentDelivery.batchId,
							batchIds.map((batch) => batch.id),
						),
						eq(agentDelivery.status, "pending"),
					),
				);
		}
	}

	private async reclaimExpiredLeases(now: WorkerNow): Promise<void> {
		await db
			.update(agentResponseBatch)
			.set({ status: "pending", workerId: null, claimToken: null, claimedAt: null, leaseExpiresAt: null })
			.where(and(eq(agentResponseBatch.status, "processing"), lte(agentResponseBatch.leaseExpiresAt, now)));
	}

	private async claimDueBatch(now: WorkerNow): Promise<ClaimedBatch | null> {
		const claimToken = randomUUID();
		const leaseExpiresAt = new Date(now.getTime() + this.leaseMs);
		const result = await db.execute(drizzleSql`
			UPDATE agent_response_batch
			SET status = 'processing', worker_id = ${this.workerId}, claim_token = ${claimToken}, claimed_at = ${now.toISOString()}::timestamp, lease_expires_at = ${leaseExpiresAt.toISOString()}::timestamp, generation_count = generation_count + 1
			WHERE id = (
				SELECT id FROM agent_response_batch
				WHERE status = 'pending' AND due_at <= ${now.toISOString()}::timestamp
				ORDER BY due_at ASC, id ASC
				FOR UPDATE SKIP LOCKED
				LIMIT 1
			)
			RETURNING id
		`);
		const id = (result as unknown as Array<{ id: number }>)[0]?.id;
		if (!id) return null;
		return (await db.query.agentResponseBatch.findFirst({ where: eq(agentResponseBatch.id, id) })) ?? null;
	}

	private async processBatch(batch: ClaimedBatch, now: WorkerNow): Promise<void> {
		const stopHeartbeat = this.startHeartbeat(batch);
		try {
			await this.processClaimedBatch(batch, now);
		} finally {
			stopHeartbeat();
		}
	}

	private async processClaimedBatch(batch: ClaimedBatch, now: WorkerNow): Promise<void> {
		const session = await db.query.practiceSession.findFirst({
			where: eq(practiceSession.id, batch.sessionId),
			with: { task: true, messages: { orderBy: [asc(sessionMessage.createdAt), asc(sessionMessage.id)] } },
		});
		// max_turns-completed sessions keep generating: their pending batches are
		// spared unclaimed batches and farewell batches whose reply must still land.
		if (!session || (session.status !== "in_progress" && !hasEndedByMaxTurns(session))) {
			await db.update(agentResponseBatch).set({ status: "cancelled", completedAt: now }).where(this.batchClaimFence(batch));
			return;
		}

		// The claim is the moment the agent "notices" the learner's message: advance the
		// read receipt watermark before generating. GREATEST keeps it monotonic when a
		// re-targeted or reclaimed batch references an older input message.
		if (batch.inputMessageId !== null) {
			await db
				.update(practiceSession)
				.set({ agentReadUpToMessageId: drizzleSql`greatest(coalesce(${practiceSession.agentReadUpToMessageId}, 0), ${batch.inputMessageId})` })
				.where(eq(practiceSession.id, batch.sessionId));
		}

		const history = session.messages.filter((message) => message.role === "user" || message.role === "assistant");
		const latestUserMessageId = [...history].reverse().find((message) => message.role === "user")?.id ?? null;
		const expectedInputMessageId = batch.inputMessageId ?? latestUserMessageId;
		if (expectedInputMessageId !== batch.inputMessageId) {
			const updated = await db
				.update(agentResponseBatch)
				.set({ inputMessageId: expectedInputMessageId })
				.where(this.batchClaimFence(batch))
				.returning({ id: agentResponseBatch.id });
			if (updated.length === 0) return;
		}

		try {
			const result = await generateAgentResponse({
				baseSystemPrompt: (session.agentPromptSnapshot as { systemPrompt: string }).systemPrompt,
				ui: (session.agentPromptSnapshot as { ui?: Parameters<typeof generateAgentResponse>[0]["ui"] }).ui ?? "discord",
				history,
				userId: session.userId,
				additionalInstruction: getBatchGenerationInstruction(batch.kind, session.followUpCount),
			});
			const freshSession = await db.query.practiceSession.findFirst({
				where: eq(practiceSession.id, session.id),
				columns: { status: true, completionReason: true },
			});
			const freshMessages = await db.query.sessionMessage.findMany({
				where: and(eq(sessionMessage.sessionId, session.id), eq(sessionMessage.role, "user")),
				orderBy: [asc(sessionMessage.createdAt), asc(sessionMessage.id)],
			});
			const freshLatestUserMessageId = freshMessages.at(-1)?.id ?? null;
			// When the turn-limit message ends the session mid-generation, the reply
			// being composed is still delivered instead of being discarded as stale:
			// there is nothing left to fold in (no further turn can happen).
			const endedByMaxTurns = hasEndedByMaxTurns(freshSession);
			const staleGeneration =
				!endedByMaxTurns &&
				isStaleGeneration({
					expectedInputMessageId,
					latestUserMessageId: freshLatestUserMessageId,
					sessionStatus: freshSession?.status ?? "completed",
				});
			if (staleGeneration) {
				const sessionEnded = freshSession?.status !== "in_progress";
				await db
					.update(agentResponseBatch)
					.set({
						status: sessionEnded ? "cancelled" : "pending",
						dueAt: new Date(now.getTime() + RE_ENGAGE_DELAY_MS),
						staleCount: batch.staleCount + 1,
						workerId: null,
						claimToken: null,
						leaseExpiresAt: null,
						completedAt: sessionEnded ? now : null,
					})
					.where(this.batchClaimFence(batch));
				return;
			}

			const deliveries = result.parsedResult.deliveries;
			const terminated = result.parsedResult.decision === "terminate_abuse";
			await db.transaction(async (tx) => {
				const stillClaimed = await tx
					.update(agentResponseBatch)
					.set({
						status: deliveries.length > 0 ? "delivery_pending" : terminated ? "terminated" : "no_reply",
						requestMessages: result.requestMessages,
						rawResponse: result.rawResponse,
						parsedResult: result.parsedResult,
						providerMetadata: result.providerMetadata,
						allowIdleFollowUp: result.parsedResult.allowIdleFollowUp,
						completedAt: deliveries.length > 0 ? null : now,
						error: null,
						workerId: null,
						claimToken: null,
						leaseExpiresAt: null,
					})
					.where(this.batchClaimFence(batch))
					.returning({ id: agentResponseBatch.id });
				if (stillClaimed.length === 0) return;

				if (terminated && deliveries.length === 0) {
					await tx
						.update(practiceSession)
						.set({ status: "completed", completionReason: "terminated_abuse", completedAt: now })
						.where(and(eq(practiceSession.id, batch.sessionId), eq(practiceSession.status, "in_progress")));
					await tx
						.update(agentResponseBatch)
						.set({ status: "cancelled", completedAt: now })
						.where(
							and(
								eq(agentResponseBatch.sessionId, batch.sessionId),
								inArray(agentResponseBatch.status, ["pending", "processing"]),
								ne(agentResponseBatch.id, batch.id),
							),
						);
				}
				let dueAt = now;
				for (const [sequence, delivery] of deliveries.entries()) {
					await tx
						.insert(agentDelivery)
						.values({ batchId: batch.id, sequence, content: delivery.content, replyToMessageId: delivery.replyToMessageId, dueAt });
					dueAt = getDeliveryDueAt(dueAt, delivery.content);
				}
				if (deliveries.length === 0 && result.parsedResult.allowIdleFollowUp && !terminated) {
					await this.scheduleFollowUp(tx, batch.sessionId, now, session.urgency);
				}
			});
		} catch (error) {
			await this.handleGenerationFailure(batch, now, error);
		}
	}

	private async handleGenerationFailure(batch: ClaimedBatch, now: WorkerNow, error: unknown): Promise<void> {
		const retry = shouldRetryGeneration(batch.generationCount);
		const failureArtifacts = error instanceof AgentGenerationError ? error.failureArtifacts : null;
		try {
			await db.transaction(async (tx) => {
				const stillClaimed = await tx
					.update(agentResponseBatch)
					.set({
						status: retry ? "pending" : "failed",
						...(retry ? { dueAt: new Date(now.getTime() + this.retryBackoffMs) } : { completedAt: now }),
						error: safeError(error),
						requestMessages: failureArtifacts?.requestMessages ?? batch.requestMessages,
						rawResponse: failureArtifacts?.rawResponse ?? batch.rawResponse,
						providerMetadata: failureArtifacts?.providerMetadata ?? batch.providerMetadata,
						workerId: null,
						claimToken: null,
						leaseExpiresAt: null,
					})
					.where(this.batchClaimFence(batch))
					.returning({ id: agentResponseBatch.id });
				if (!retry && stillClaimed.length > 0 && batch.inputMessageId !== null) {
					const message = await tx.query.sessionMessage.findFirst({
						where: eq(sessionMessage.id, batch.inputMessageId),
						columns: { llmMetadata: true },
					});
					if (message) {
						const metadata = (message.llmMetadata ?? {}) as Record<string, unknown>;
						await tx
							.update(sessionMessage)
							.set({ llmMetadata: { ...metadata, failed: true, failureError: safeError(error) } })
							.where(eq(sessionMessage.id, batch.inputMessageId));
					}
				}
			});
		} catch (persistenceError) {
			console.error("async reply worker failed to persist generation failure", persistenceError);
		}
	}

	private async deliverDueMessages(now: WorkerNow): Promise<void> {
		const deliveries = await db.query.agentDelivery.findMany({
			where: and(eq(agentDelivery.status, "pending"), lte(agentDelivery.dueAt, now)),
			orderBy: [asc(agentDelivery.dueAt), asc(agentDelivery.id)],
			limit: this.concurrency,
		});
		for (const delivery of deliveries) {
			const batch = await db.query.agentResponseBatch.findFirst({ where: eq(agentResponseBatch.id, delivery.batchId) });
			if (!batch) continue;
			const session = await db.query.practiceSession.findFirst({
				where: eq(practiceSession.id, batch.sessionId),
				columns: { status: true, completionReason: true, urgency: true },
			});
			if (!session || !shouldDeliverIntoEndedSession(session, batch.status)) {
				await db
					.update(agentDelivery)
					.set({ status: "cancelled" })
					.where(and(eq(agentDelivery.id, delivery.id), eq(agentDelivery.status, "pending")));
				continue;
			}

			await db.transaction(async (tx) => {
				const claimed = await tx
					.update(agentDelivery)
					.set({ status: "delivered", deliveredAt: now })
					.where(and(eq(agentDelivery.id, delivery.id), eq(agentDelivery.status, "pending")))
					.returning({ id: agentDelivery.id });
				if (claimed.length === 0) return;

				// Resolve the comment this reply answers: the model targets a specific
				// message when threading matters, otherwise the burst anchor (last message)
				// folds the reply, mirroring the synchronous per-turn parent.
				const targetMessageId = delivery.replyToMessageId ?? batch.inputMessageId;
				const targetMessage = targetMessageId
					? await tx.query.sessionMessage.findFirst({
							where: eq(sessionMessage.id, targetMessageId),
							columns: { llmMetadata: true },
						})
					: null;
				const thread = getThreadMetadataFromMessage(targetMessage?.llmMetadata);

				await tx
					.insert(sessionMessage)
					.values({
						sessionId: batch.sessionId,
						role: "assistant",
						content: delivery.content,
						responseBatchId: batch.id,
						deliveryId: delivery.id,
						llmMetadata: buildDeliveredReplyMetadata(thread, delivery.replyToMessageId),
					})
					.onConflictDoNothing({ target: sessionMessage.deliveryId });

				const remaining = await tx.query.agentDelivery.findFirst({
					where: and(eq(agentDelivery.batchId, batch.id), eq(agentDelivery.status, "pending")),
				});
				if (remaining) return;

				const terminated = batch.parsedResult && (batch.parsedResult as { decision?: string }).decision === "terminate_abuse";
				const finalized = await tx
					.update(agentResponseBatch)
					.set({
						status: terminated ? "terminated" : "completed",
						completedAt: now,
					})
					.where(and(eq(agentResponseBatch.id, batch.id), eq(agentResponseBatch.status, "delivery_pending")))
					.returning({ id: agentResponseBatch.id });
				if (finalized.length === 0) return;
				if (terminated) {
					await tx
						.update(practiceSession)
						.set({ status: "completed", completionReason: "terminated_abuse", completedAt: now })
						.where(and(eq(practiceSession.id, batch.sessionId), eq(practiceSession.status, "in_progress")));
				} else if (batch.allowIdleFollowUp) {
					await this.scheduleFollowUp(tx, batch.sessionId, now, session.urgency);
				}
			});
		}
	}

	private async scheduleFollowUp(executor: AsyncReplyExecutor, sessionId: number, now: WorkerNow, urgency: Urgency): Promise<void> {
		const session = await executor.query.practiceSession.findFirst({ where: eq(practiceSession.id, sessionId) });
		if (!session || session.status !== "in_progress" || session.followUpCount >= 2 || session.expiresAt <= now) return;
		const existing = await executor.query.agentResponseBatch.findFirst({
			where: and(
				eq(agentResponseBatch.sessionId, sessionId),
				inArray(agentResponseBatch.status, ["pending", "processing", "stale", "delivery_pending"]),
			),
		});
		if (existing) return;
		const claimed = await executor
			.update(practiceSession)
			.set({ followUpCount: session.followUpCount + 1 })
			.where(and(eq(practiceSession.id, sessionId), eq(practiceSession.followUpCount, session.followUpCount)))
			.returning({ id: practiceSession.id });
		if (claimed.length === 0) return;
		await executor.insert(agentResponseBatch).values({
			sessionId,
			kind: "follow_up",
			status: "pending",
			dueAt: getUrgencyFollowUpAt(now, urgency, session.followUpCount + 1),
			inputMessageId: null,
		});
	}
}
