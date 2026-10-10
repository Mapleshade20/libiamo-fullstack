import { randomUUID } from "node:crypto";
import { and, asc, sql as drizzleSql, eq, inArray, lte, ne, type SQL } from "drizzle-orm";
import { type UiVariant, URGENCY_PRESETS, type Urgency } from "$lib/constants";
import { getCommentId } from "$lib/practice/comment-thread";
import { getDeliveryDelayMs, RE_ENGAGE_DELAY_MS } from "$lib/practice/reply-timing";
import { isLiveChat, resolveScene } from "$lib/practice/scene";
import { db } from "$lib/server/db";
import { user as authUser } from "$lib/server/db/auth.schema";
import { agentDelivery, agentResponseBatch, practiceSession, sessionMessage } from "$lib/server/db/schema";
import { inferAddressees } from "$lib/server/practice/addressee/infer";
import { type AgentGenerationArtifacts, AgentGenerationError, generateAgentResponse } from "$lib/server/practice/agent-replies/generator";
import { type AgentEvent, isThreadedUi } from "$lib/server/practice/agent-replies/prompt";

export const DEFAULT_WORKER_SCAN_INTERVAL_MS = 1_000;
export const DEFAULT_WORKER_LEASE_MS = 30_000;
/**
 * A safety ceiling on generations in flight, not a queue: a generation only waits on the provider
 * and holds no database connection, so fairness comes from one generation per learner at a time
 * (see `claimDueBatch`), and every call is bounded by `LLM_REQUEST_TIMEOUT_MS`.
 */
export const DEFAULT_WORKER_CONCURRENCY = 200;
export const DEFAULT_WORKER_RETRY_BACKOFF_MS = 60_000;
export const MAX_GENERATION_ATTEMPTS = 3;

type WorkerNow = Date;

type ClaimedBatch = typeof agentResponseBatch.$inferSelect;
type AgentReplyExecutor = Pick<typeof db, "query" | "update" | "insert">;

export function getDeliveryDueAt(previousDueAt: Date, content: string | undefined): Date {
	return new Date(previousDueAt.getTime() + (content === undefined ? 0 : getDeliveryDelayMs(content)));
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
	if (batchStatus !== "delivery_pending") return false;
	if (hasEndedByMaxTurns(session)) return true;
	// The abuse-terminating batch's own parting reply still lands (even if the
	// feedback page already flipped the session to evaluated): the agent ended
	// the session while composing that final message for the learner.
	return (
		(session?.status === "completed" || session?.status === "evaluated" || session?.status === "abandoned") &&
		session.completionReason === "terminated_abuse"
	);
}

function safeError(error: unknown): string {
	return error instanceof Error && error.message.trim() ? error.message.slice(0, 500) : "The AI reply could not be generated.";
}

/**
 * Metadata of a delivered cast message: its author, and what it answers. Comment threads nest it
 * under its parent (null is a top-level comment); Discord shows the quoted message.
 */
export function buildDeliveredReplyMetadata(ui: UiVariant, delivery: { author: string | null; replyTo: string | null }): Record<string, unknown> {
	return {
		...(delivery.author ? { assistantAuthorName: delivery.author } : {}),
		...(delivery.replyTo ? (isThreadedUi(ui) ? { thread: { parentCommentId: delivery.replyTo } } : { replyTo: delivery.replyTo }) : {}),
		asyncDelivery: true,
	};
}

/** Silent turns a live group chat moves on by itself, each a minute or two after the last. */
export const LIVE_CHAT_TICKS = 6;
const LIVE_CHAT_TICK_MS = { min: 60_000, max: 120_000 };

/**
 * A live chat is written only while the learner watches it: a tick whose last messages they left
 * unread produces nothing, so an abandoned room spends no calls, and one they return to moves on.
 */
export function isUnwatchedTick(input: { kind: string; live: boolean; lastReplyId: number | null; lastSeenId: number | null }): boolean {
	return input.kind === "follow_up" && input.live && input.lastReplyId !== null && input.lastReplyId > (input.lastSeenId ?? 0);
}

export function getUrgencyFollowUpAt(now: Date, urgency: Urgency, followUpCount: number): Date {
	return new Date(now.getTime() + URGENCY_PRESETS[urgency].idleFollowUpDelayMs * Math.max(1, followUpCount));
}

/** Why a batch is generating: idle follow-ups tell the agent the learner went quiet and how many nudges remain. */
export function getBatchGenerationEvent(kind: string, followUpCount: number): AgentEvent {
	return kind === "follow_up" ? { kind: "follow_up", followUpCount } : { kind: "reply" };
}

export type AgentReplyWorkerOptions = {
	workerId?: string;
	leaseMs?: number;
	scanIntervalMs?: number;
	concurrency?: number;
	retryBackoffMs?: number;
};

export class AgentReplyWorker {
	private readonly workerId: string;
	private readonly leaseMs: number;
	private readonly scanIntervalMs: number;
	private readonly concurrency: number;
	private readonly retryBackoffMs: number;
	private timer: ReturnType<typeof setInterval> | undefined;
	private schedulerTick: Promise<void> | undefined;
	private readonly activeGenerations = new Set<Promise<void>>();
	private stopping = false;

	constructor(options: AgentReplyWorkerOptions = {}) {
		this.workerId = options.workerId ?? `agent-replies-${randomUUID()}`;
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
			.catch((error) => console.error("agent reply worker tick failed", error))
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
				.catch((error) => console.error("agent reply worker generation failed", error))
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
				.catch((error) => console.error("agent reply worker heartbeat failed", error));
		}, intervalMs);
		return () => clearInterval(timer);
	}

	private async expireSessions(now: WorkerNow): Promise<void> {
		const expired = await db
			.update(practiceSession)
			.set({ status: "abandoned", completionReason: "max_session_age", completedAt: now })
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
				SELECT b.id FROM agent_response_batch b
				JOIN practice_session s ON s.id = b.session_id
				WHERE b.status = 'pending' AND b.due_at <= ${now.toISOString()}::timestamp
					-- One generation per learner at a time, so nobody's backlog holds up everyone else's replies.
					AND NOT EXISTS (
						SELECT 1 FROM agent_response_batch busy
						JOIN practice_session busy_session ON busy_session.id = busy.session_id
						WHERE busy.status = 'processing' AND busy_session.user_id = s.user_id
					)
				ORDER BY b.due_at ASC, b.id ASC
				FOR UPDATE OF b SKIP LOCKED
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
		const learner = await db.query.user.findFirst({ where: eq(authUser.id, session.userId), columns: { name: true } });
		const learnerName = learner?.name || "Learner";
		if (
			isUnwatchedTick({
				kind: batch.kind,
				live: isLiveChat(session.task.ui, resolveScene(session.task.ui, session.task.openingState, session.task.id, learnerName)),
				lastReplyId: session.messages.findLast((message) => message.role === "assistant")?.id ?? null,
				lastSeenId: session.lastSeenAssistantMessageId,
			})
		) {
			// Time passes all the same: the tick spends its share of the silence and hands over to the next.
			const skipped = await db
				.update(agentResponseBatch)
				.set({ status: "cancelled", completedAt: now })
				.where(this.batchClaimFence(batch))
				.returning({ id: agentResponseBatch.id });
			if (skipped.length > 0) await this.scheduleFollowUp(db, session.id, now, false);
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
			// Beta, OpenRouter keys only: whom an unmarked group message is for. Null leaves the floor as it was.
			const addressees = batch.kind === "reply" ? await inferAddressees({ userId: session.userId, task: session.task, learnerName, history }) : null;
			const result = await generateAgentResponse({
				task: session.task,
				// The same name the practice interface shows for the learner.
				learnerName,
				history,
				userId: session.userId,
				subjects: { taskId: session.taskId, sessionId: session.id },
				event: getBatchGenerationEvent(batch.kind, session.followUpCount),
				// Each batch draws its own floor; a retry of the same batch sees the same one.
				seed: batch.id,
				...(addressees ? { addressees } : {}),
			});
			// Anchor every post-generation timestamp at completion time. The scan's `now`
			// predates the provider call; anchoring there would let generation latency
			// pre-consume the staggered delivery schedule, so every delivery would already
			// be overdue the moment it is committed.
			const completedAt = new Date();
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
						dueAt: new Date(completedAt.getTime() + RE_ENGAGE_DELAY_MS),
						staleCount: batch.staleCount + 1,
						workerId: null,
						claimToken: null,
						leaseExpiresAt: null,
						completedAt: sessionEnded ? completedAt : null,
					})
					.where(this.batchClaimFence(batch));
				return;
			}

			await this.persistGenerationOutcome(batch, result, completedAt);
		} catch (error) {
			await this.handleGenerationFailure(batch, new Date(), error);
		}
	}

	/**
	 * Persists a finished generation: flips the batch to its delivery/terminal
	 * status under the claim fence, ends the session and cancels every sibling
	 * batch on abuse termination, queues the deliveries, and schedules the idle
	 * follow-up for silent turns.
	 */
	private async persistGenerationOutcome(batch: ClaimedBatch, result: AgentGenerationArtifacts, now: WorkerNow): Promise<void> {
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

			if (deliveries.length === 0 && result.parsedResult.decision === "no_reply" && batch.inputMessageId !== null) {
				const inputMessage = await tx.query.sessionMessage.findFirst({
					where: eq(sessionMessage.id, batch.inputMessageId),
					columns: { llmMetadata: true },
				});
				const metadata = (inputMessage?.llmMetadata ?? {}) as Record<string, unknown>;
				await tx
					.update(sessionMessage)
					.set({ llmMetadata: { ...metadata, noReply: true } })
					.where(eq(sessionMessage.id, batch.inputMessageId));
			}

			// Abuse termination ends the session the moment the decision is made,
			// final reply or not: no sibling batch may generate or deliver anything
			// more, and the learner cannot keep the session alive while the parting
			// message is still queued. The terminating batch keeps its delivery.
			if (terminated) {
				await tx
					.update(practiceSession)
					.set({ status: "abandoned", completionReason: "terminated_abuse", completedAt: now })
					.where(and(eq(practiceSession.id, batch.sessionId), eq(practiceSession.status, "in_progress")));
				await tx
					.update(agentResponseBatch)
					.set({ status: "cancelled", completedAt: now })
					.where(
						and(
							eq(agentResponseBatch.sessionId, batch.sessionId),
							inArray(agentResponseBatch.status, ["pending", "processing", "delivery_pending"]),
							ne(agentResponseBatch.id, batch.id),
						),
					);
				const siblingIds = await tx
					.select({ id: agentResponseBatch.id })
					.from(agentResponseBatch)
					.where(and(eq(agentResponseBatch.sessionId, batch.sessionId), ne(agentResponseBatch.id, batch.id)));
				if (siblingIds.length > 0) {
					await tx
						.update(agentDelivery)
						.set({ status: "cancelled" })
						.where(
							and(
								inArray(
									agentDelivery.batchId,
									siblingIds.map((sibling) => sibling.id),
								),
								eq(agentDelivery.status, "pending"),
							),
						);
				}
			}
			// Typing simulation: the first message is due the moment the agent finishes
			// composing (the provider latency acted as its typing time), and the wait
			// before each later message scales with that message's own length.
			let dueAt = now;
			for (const [sequence, delivery] of deliveries.entries()) {
				if (sequence > 0) dueAt = getDeliveryDueAt(dueAt, delivery.content);
				await tx
					.insert(agentDelivery)
					.values({ batchId: batch.id, sequence, content: delivery.content, author: delivery.author, replyTo: delivery.replyTo, dueAt });
			}
			if (deliveries.length === 0 && result.parsedResult.allowIdleFollowUp && !terminated) {
				await this.scheduleFollowUp(tx, batch.sessionId, now, batch.kind === "reply");
			}
		});
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
			console.error("agent reply worker failed to persist generation failure", persistenceError);
		}
	}

	private async deliverDueMessages(now: WorkerNow): Promise<void> {
		const deliveries = await db.query.agentDelivery.findMany({
			where: and(eq(agentDelivery.status, "pending"), lte(agentDelivery.dueAt, now)),
			orderBy: [asc(agentDelivery.dueAt), asc(agentDelivery.id)],
			limit: this.concurrency,
		});
		for (const delivery of deliveries) {
			const batch = await db.query.agentResponseBatch.findFirst({
				where: eq(agentResponseBatch.id, delivery.batchId),
				with: { session: { columns: {}, with: { task: { columns: { ui: true } } } } },
			});
			if (!batch) continue;

			await db.transaction(async (tx) => {
				// Locks are taken session -> batch -> delivery, the same order as
				// submitMessage, so concurrent submissions and deliveries only ever
				// block each other, never deadlock. Reading the session under its row
				// lock also makes the deliverability check transactional.
				const [session] = await tx
					.select({ status: practiceSession.status, completionReason: practiceSession.completionReason })
					.from(practiceSession)
					.where(eq(practiceSession.id, batch.sessionId))
					.for("update");
				// The batch row lock serializes "claim delivery + any sibling still pending?
				// + finalize" across workers: without it, two transactions delivering
				// sibling messages each observe the other's uncommitted claim as a
				// pending delivery and both skip finalization, leaving the batch stuck
				// in delivery_pending with its follow-up scheduling lost.
				const [lockedBatch] = await tx
					.select({ status: agentResponseBatch.status })
					.from(agentResponseBatch)
					.where(eq(agentResponseBatch.id, batch.id))
					.for("update");
				if (!session || !lockedBatch || !shouldDeliverIntoEndedSession(session, lockedBatch.status)) {
					await tx
						.update(agentDelivery)
						.set({ status: "cancelled" })
						.where(and(eq(agentDelivery.id, delivery.id), eq(agentDelivery.status, "pending")));
					return;
				}

				const claimed = await tx
					.update(agentDelivery)
					.set({ status: "delivered", deliveredAt: now })
					.where(and(eq(agentDelivery.id, delivery.id), eq(agentDelivery.status, "pending")))
					.returning({ id: agentDelivery.id });
				if (claimed.length === 0) return;

				const ui = batch.session?.task.ui ?? "imessage";
				const replyTo = await this.resolveBatchReference(tx, ui, batch.id, delivery.replyTo);

				await tx
					.insert(sessionMessage)
					.values({
						sessionId: batch.sessionId,
						role: "assistant",
						content: delivery.content,
						responseBatchId: batch.id,
						deliveryId: delivery.id,
						llmMetadata: buildDeliveredReplyMetadata(ui, { author: delivery.author, replyTo }),
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
						.set({ status: "abandoned", completionReason: "terminated_abuse", completedAt: now })
						.where(and(eq(practiceSession.id, batch.sessionId), eq(practiceSession.status, "in_progress")));
				} else if (batch.allowIdleFollowUp) {
					await this.scheduleFollowUp(tx, batch.sessionId, now, batch.kind === "reply");
				}
			});
		}
	}

	/** `@n` names the n-th delivery of the same batch: the message it became, if it was delivered. */
	private async resolveBatchReference(executor: AgentReplyExecutor, ui: UiVariant, batchId: number, replyTo: string | null): Promise<string | null> {
		if (!replyTo?.startsWith("@")) return replyTo;
		const sibling = await executor.query.agentDelivery.findFirst({
			where: and(eq(agentDelivery.batchId, batchId), eq(agentDelivery.sequence, Number(replyTo.slice(1)))),
			columns: {},
			with: { message: { columns: { id: true } } },
		});
		return sibling?.message ? getCommentId(ui, { id: String(sibling.message.id), role: "agent" }) : null;
	}

	/** `afterReply`: the batch answered the learner, so a live chat's silence (and its tick budget) starts over. */
	private async scheduleFollowUp(executor: AgentReplyExecutor, sessionId: number, now: WorkerNow, afterReply: boolean): Promise<void> {
		const session = await executor.query.practiceSession.findFirst({
			where: eq(practiceSession.id, sessionId),
			with: { task: { columns: { id: true, ui: true, openingState: true, urgency: true } } },
		});
		if (!session) return;
		const learner = await executor.query.user.findFirst({ where: eq(authUser.id, session.userId), columns: { name: true } });
		const { task } = session;
		const live = isLiveChat(task.ui, resolveScene(task.ui, task.openingState, task.id, learner?.name || "Learner"));
		const used = live && afterReply ? 0 : session.followUpCount;
		if (session.status !== "in_progress" || used >= (live ? LIVE_CHAT_TICKS : 2) || session.expiresAt <= now) return;
		const existing = await executor.query.agentResponseBatch.findFirst({
			where: and(
				eq(agentResponseBatch.sessionId, sessionId),
				inArray(agentResponseBatch.status, ["pending", "processing", "stale", "delivery_pending"]),
			),
		});
		if (existing) return;
		const claimed = await executor
			.update(practiceSession)
			.set({ followUpCount: used + 1 })
			.where(and(eq(practiceSession.id, sessionId), eq(practiceSession.followUpCount, session.followUpCount)))
			.returning({ id: practiceSession.id });
		if (claimed.length === 0) return;
		await executor.insert(agentResponseBatch).values({
			sessionId,
			kind: "follow_up",
			status: "pending",
			dueAt: live
				? new Date(now.getTime() + LIVE_CHAT_TICK_MS.min + Math.random() * (LIVE_CHAT_TICK_MS.max - LIVE_CHAT_TICK_MS.min))
				: getUrgencyFollowUpAt(now, task.urgency ?? "high", used + 1),
			inputMessageId: null,
		});
	}
}
