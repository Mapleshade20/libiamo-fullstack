import { randomUUID } from "node:crypto";
import { and, asc, sql as drizzleSql, eq, gte, inArray, isNotNull, lte, ne, or, type SQL } from "drizzle-orm";
import { type UiVariant, URGENCY_PRESETS, type Urgency } from "$lib/constants";
import { type CommentThreadMetadata, flattenOpeningComments, getCommentId, getSceneMessageRef } from "$lib/practice/comment-thread";
import { getDeliveryDelayMs, RE_ENGAGE_DELAY_MS, sampleReplyDelayMs } from "$lib/practice/reply-timing";
import { isAsyncSurface, isLiveChat, resolveScene } from "$lib/practice/scene";
import { db } from "$lib/server/db";
import { user as authUser } from "$lib/server/db/auth.schema";
import { agentDelivery, agentResponseBatch, practiceSession, sessionMessage } from "$lib/server/db/schema";
import { inferAddressees } from "$lib/server/practice/addressee/infer";
import { allocateParticipants, drawWorldParticipant } from "$lib/server/practice/agent-replies/floor";
import {
	type AgentGenerationArtifacts,
	AgentGenerationError,
	generateAgentResponse,
	type PreservedDelivery,
} from "$lib/server/practice/agent-replies/generator";
import { type AgentEvent, isThreadedUi } from "$lib/server/practice/agent-replies/prompt";
import { buildSceneTranscript } from "$lib/server/practice/prompt-context";

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
/** A transaction over the practice tables, taken with the session row locked first. */
type SessionTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Metadata as the worker reads it off a persisted message row. */
function messageMetadataOf(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** A learner message's scene ref, as the comment id scheme names it. */
function userMessageRef(ui: UiVariant, message: { id: number; role?: string; llmMetadata?: unknown } | undefined): string | null {
	if (!message || (message.role !== undefined && message.role !== "user")) return null;
	const metadata = messageMetadataOf(message.llmMetadata);
	const thread = (metadata.thread ?? undefined) as CommentThreadMetadata | undefined;
	return getCommentId(ui, {
		id: String(message.id),
		role: "user",
		clientMessageId: typeof metadata.clientMessageId === "string" ? metadata.clientMessageId : undefined,
		thread,
	});
}

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
 * requested, expired, abuse) cancels outstanding deliveries. A world batch never
 * delivers into an ended session: ambient activity ends with the learner's turn.
 */
export function shouldDeliverIntoEndedSession(
	session: { status: string; completionReason: string | null } | null | undefined,
	batchStatus: string,
	kind?: string,
): boolean {
	if (session?.status === "in_progress") return true;
	if (kind === "world") return false;
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
 * A world moment on an async surface waits the same way.
 */
export function isUnwatchedTick(input: { kind: string; live: boolean; lastReplyId: number | null; lastSeenId: number | null }): boolean {
	const watchesTheRoom = (input.kind === "follow_up" && input.live) || input.kind === "world";
	return watchesTheRoom && input.lastReplyId !== null && input.lastReplyId > (input.lastSeenId ?? 0);
}

export function getUrgencyFollowUpAt(now: Date, urgency: Urgency, followUpCount: number): Date {
	return new Date(now.getTime() + URGENCY_PRESETS[urgency].idleFollowUpDelayMs * Math.max(1, followUpCount));
}

/** World moments that may spend a call per silence window; a learner message starts a new window. */
export const WORLD_WINDOW_LIMIT = 3;
/** Chance that a landed world moment is followed by another within the budget. */
export const WORLD_CONTINUATION_CHANCE = 0.5;
const WORLD_MIN_BEFORE_EXPIRY_MS = 5 * 60_000;

/** The idle cadence world moments live on: twice the sampled reply delay. */
export function worldIdleDelayMs(urgency: Urgency): number {
	return 2 * sampleReplyDelayMs(urgency);
}

/**
 * Settles the aggregated outcome flags on a learner message and everything folded into it:
 * answered or awaiting while any sibling taker of its current attempt has delivered or is still
 * working; failed once every contributing sibling ended without delivering anything and one of
 * them failed; noReply when all ended silent. Siblings cancelled by session-level guards do not
 * settle anything — their display is governed by those guards — and neither do batches of an
 * earlier attempt a manual retry superseded. Must run in a transaction that holds the session
 * row lock (session -> batch -> delivery), so siblings ending simultaneously serialize and
 * exactly one of them performs the final write.
 */
export async function settleUserMessageFlags(tx: SessionTx, messageId: number): Promise<void> {
	const message = await tx.query.sessionMessage.findFirst({ where: eq(sessionMessage.id, messageId) });
	if (!message || message.role !== "user") return;
	const metadata = messageMetadataOf(message.llmMetadata);
	const attempt = typeof metadata.attempt === "number" ? metadata.attempt : 0;
	const contributing = await tx.query.agentResponseBatch.findMany({
		where: and(
			eq(agentResponseBatch.sessionId, message.sessionId),
			eq(agentResponseBatch.inputMessageId, messageId),
			eq(agentResponseBatch.attempt, attempt),
			eq(agentResponseBatch.kind, "reply"),
		),
		columns: { id: true, status: true, error: true },
	});
	const siblings = contributing.filter((batch) => batch.status !== "cancelled" && batch.status !== "terminated");
	if (siblings.length === 0) return;
	const deliveredCounts = await tx
		.select({ batchId: agentDelivery.batchId, count: drizzleSql<number>`count(*)::int` })
		.from(agentDelivery)
		.where(
			and(
				inArray(
					agentDelivery.batchId,
					siblings.map((batch) => batch.id),
				),
				eq(agentDelivery.status, "delivered"),
			),
		)
		.groupBy(agentDelivery.batchId);
	const delivered = new Set(deliveredCounts.filter((row) => row.count > 0).map((row) => row.batchId));
	const failure = siblings.find((batch) => batch.status === "failed");
	const awaiting = siblings.some(
		(batch) =>
			delivered.has(batch.id) ||
			batch.status === "pending" ||
			batch.status === "processing" ||
			batch.status === "stale" ||
			batch.status === "delivery_pending",
	);
	if (!awaiting && !failure && !siblings.every((batch) => batch.status === "no_reply" || batch.status === "completed")) return;

	const chain = await foldedIntoChain(tx, message);
	const flags = awaiting
		? { noReply: false }
		: failure
			? { noReply: false, failed: true, failureError: failure.error ?? "The AI reply could not be generated." }
			: { noReply: true, failed: false, failureError: null };
	for (const target of chain) {
		await tx
			.update(sessionMessage)
			.set({ llmMetadata: { ...messageMetadataOf(target.llmMetadata), ...flags } })
			.where(eq(sessionMessage.id, target.id));
	}
}

/** The head message plus everything folded into it (transitively, with a cycle guard). */
async function foldedIntoChain(tx: SessionTx, head: { id: number; sessionId: number }): Promise<Array<{ id: number; llmMetadata: unknown }>> {
	const messages = await tx.query.sessionMessage.findMany({
		where: and(eq(sessionMessage.sessionId, head.sessionId), eq(sessionMessage.role, "user")),
		columns: { id: true, llmMetadata: true },
	});
	const foldedInto = new Map<number, number[]>();
	for (const message of messages) {
		const headId = messageMetadataOf(message.llmMetadata).foldedInto;
		if (typeof headId === "number" && headId !== message.id) foldedInto.set(headId, [...(foldedInto.get(headId) ?? []), message.id]);
	}
	const chain = [head.id];
	const seen = new Set<number>([head.id]);
	for (let at = 0; at < chain.length; at += 1) {
		for (const next of foldedInto.get(chain[at]) ?? [])
			if (!seen.has(next)) {
				seen.add(next);
				chain.push(next);
			}
	}
	return messages.filter((message) => seen.has(message.id));
}

/**
 * Schedules a world moment on an async group scene: one participant carrying on their own
 * business on the idle cadence, with the participant drawn under the same lock. Must run in a
 * transaction that holds the session row lock (session -> batch -> delivery): the budget is
 * atomic with the insertion — at most one outstanding world batch (the partial index is the
 * hard guard), at most three moments that spent a call in the current silence window, and none
 * due within five minutes of session expiry.
 */
export async function scheduleWorldMoment(
	executor: Pick<SessionTx, "query" | "insert" | "select">,
	input: { sessionId: number; now: Date; probability?: number },
): Promise<boolean> {
	const session = await executor.query.practiceSession.findFirst({
		where: eq(practiceSession.id, input.sessionId),
		with: {
			task: { columns: { id: true, ui: true, language: true, openingState: true, urgency: true } },
			messages: { orderBy: [asc(sessionMessage.createdAt), asc(sessionMessage.id)] },
		},
	});
	if (!session || session.status !== "in_progress") return false;
	const { task } = session;
	const learner = await executor.query.user.findFirst({ where: eq(authUser.id, session.userId), columns: { name: true } });
	const learnerName = learner?.name || "Learner";
	const scene = resolveScene(task.ui, task.openingState, task.id, learnerName);
	if (!isAsyncSurface(task.ui) || !scene.group) return false;
	if (input.probability !== undefined && Math.random() >= input.probability) return false;
	const urgency = task.urgency ?? "high";
	const dueAt = new Date(input.now.getTime() + worldIdleDelayMs(urgency));
	if (dueAt.getTime() > session.expiresAt.getTime() - WORLD_MIN_BEFORE_EXPIRY_MS) return false;
	const outstanding = await executor.query.agentResponseBatch.findFirst({
		where: and(
			eq(agentResponseBatch.sessionId, session.id),
			eq(agentResponseBatch.kind, "world"),
			inArray(agentResponseBatch.status, ["pending", "processing", "stale", "delivery_pending"]),
		),
		columns: { id: true },
	});
	if (outstanding) return false;
	// The silence window starts at the latest learner message; only moments that spent a call count.
	const windowStart = [...session.messages].reverse().find((message) => message.role === "user")?.createdAt;
	const spent = await executor
		.select({ count: drizzleSql<number>`count(*)::int` })
		.from(agentResponseBatch)
		.where(
			and(
				eq(agentResponseBatch.sessionId, session.id),
				eq(agentResponseBatch.kind, "world"),
				// >= , not > : an overlap moment created in the same transaction as the learner
				// message shares its now() timestamp and already belongs to the new window.
				windowStart ? gte(agentResponseBatch.createdAt, windowStart) : undefined,
				or(isNotNull(agentResponseBatch.parsedResult), isNotNull(agentResponseBatch.rawResponse), isNotNull(agentResponseBatch.error)),
			),
		);
	if ((spent[0]?.count ?? 0) >= WORLD_WINDOW_LIMIT) return false;
	const history = session.messages.filter((message) => message.role === "user" || message.role === "assistant");
	const { entries } = buildSceneTranscript({ ui: task.ui, openingState: task.openingState, messages: history, learnerName, scene });
	const participant = drawWorldParticipant({
		ui: task.ui,
		language: task.language,
		entries,
		scene,
		learnerName,
		seed: Math.floor(Math.random() * 2 ** 31),
	});
	if (!participant) return false;
	try {
		await executor
			.insert(agentResponseBatch)
			.values({ sessionId: session.id, kind: "world", status: "pending", dueAt, participant, inputMessageId: null });
	} catch (error) {
		// The partial unique index is the hard guard: a scheduling race is a no-op, not an error.
		if ((error as { code?: string }).code === "23505") return false;
		throw error;
	}
	return true;
}

/** Why a batch is generating: idle follow-ups tell the agent the learner went quiet and how many nudges remain. */
export function getBatchGenerationEvent(kind: string, followUpCount: number): AgentEvent {
	if (kind === "follow_up") return { kind: "follow_up", followUpCount };
	if (kind === "world") return { kind: "world" };
	return { kind: "reply" };
}

export type AgentReplyWorkerOptions = {
	workerId?: string;
	leaseMs?: number;
	scanIntervalMs?: number;
	concurrency?: number;
	retryBackoffMs?: number;
};

/** Whether a delivery's reply target still exists in the thread: cancelled prerequisites included. */
async function replyTargetExists(
	tx: Pick<SessionTx, "query">,
	ui: UiVariant,
	sessionId: number,
	openingState: unknown,
	ref: string,
): Promise<boolean> {
	if (!isThreadedUi(ui)) return true;
	if (flattenOpeningComments(ui as "reddit" | "ao3", openingState).some((comment) => comment.id === ref)) return true;
	const messages = await tx.query.sessionMessage.findMany({
		where: eq(sessionMessage.sessionId, sessionId),
		columns: { id: true, role: true, llmMetadata: true },
	});
	return messages.some((message) => {
		const metadata = messageMetadataOf(message.llmMetadata);
		return (
			getSceneMessageRef(ui, {
				id: String(message.id),
				role: message.role === "user" ? "user" : "agent",
				clientMessageId: typeof metadata.clientMessageId === "string" ? metadata.clientMessageId : undefined,
				thread: (metadata.thread ?? undefined) as CommentThreadMetadata | undefined,
			}) === ref
		);
	});
}

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
		// A world batch ends with the learner's turn: ambient activity never generates
		// into an ended session.
		const spared = hasEndedByMaxTurns(session) && batch.kind !== "world";
		if (!session || (session.status !== "in_progress" && !spared)) {
			await db.update(agentResponseBatch).set({ status: "cancelled", completedAt: now }).where(this.batchClaimFence(batch));
			return;
		}
		const learner = await db.query.user.findFirst({ where: eq(authUser.id, session.userId), columns: { name: true } });
		const learnerName = learner?.name || "Learner";
		const task = session.task;
		const scene = resolveScene(task.ui, task.openingState, task.id, learnerName);
		if (
			isUnwatchedTick({
				kind: batch.kind,
				live: isLiveChat(task.ui, scene),
				lastReplyId: session.messages.findLast((message) => message.role === "assistant")?.id ?? null,
				lastSeenId: session.lastSeenAssistantMessageId,
			})
		) {
			if (batch.kind === "world") {
				await this.skipUnwatchedWorld(db, batch, session, now);
				return;
			}
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
		// Live-style reply batches fold into the newest learner message; a world moment has no input.
		const expectedInputMessageId = batch.kind === "world" ? null : (batch.inputMessageId ?? latestUserMessageId);
		if (expectedInputMessageId !== batch.inputMessageId) {
			const updated = await db
				.update(agentResponseBatch)
				.set({ inputMessageId: expectedInputMessageId })
				.where(this.batchClaimFence(batch))
				.returning({ id: agentResponseBatch.id });
			if (updated.length === 0) return;
		}

		// The conversation this take-up serves, pinned by its ref end to end.
		const targetRef =
			isAsyncSurface(task.ui) && batch.kind === "reply" && batch.inputMessageId !== null
				? userMessageRef(
						task.ui,
						history.find((message) => message.id === batch.inputMessageId),
					)
				: null;

		// A pre-migration reply batch carries no participant: draw it here, at claim, where the
		// old single-active-batch invariant makes the draw race-free, and from this claim on the
		// batch follows the new contract.
		let participant = batch.participant;
		if (isAsyncSurface(task.ui) && batch.kind === "reply" && participant === null) {
			const { entries, refs } = buildSceneTranscript({ ui: task.ui, openingState: task.openingState, messages: history, learnerName, scene });
			const targetIndex = targetRef ? refs.indexOf(targetRef) : -1;
			const target = targetIndex >= 0 ? entries[targetIndex] : entries.findLast((entry) => entry.role === "learner");
			const drawn = target
				? (allocateParticipants({ ui: task.ui, language: task.language, entries, scene, learnerName, seed: batch.id, count: 1, target })[0] ??
					scene.counterpart.name)
				: scene.counterpart.name;
			const persisted = await db
				.update(agentResponseBatch)
				.set({ participant: drawn })
				.where(this.batchClaimFence(batch))
				.returning({ id: agentResponseBatch.id });
			if (persisted.length === 0) return;
			participant = drawn;
		}

		try {
			// Beta, OpenRouter keys only: whom an unmarked group message is for. Null leaves the floor as it was.
			const addressees = batch.kind === "reply" ? await inferAddressees({ userId: session.userId, task, learnerName, history, targetRef }) : null;
			const result = await generateAgentResponse({
				task,
				// The same name the practice interface shows for the learner.
				learnerName,
				history,
				userId: session.userId,
				subjects: { taskId: session.taskId, sessionId: session.id },
				event: getBatchGenerationEvent(batch.kind, session.followUpCount),
				// Each batch draws its own floor; a retry of the same batch sees the same one.
				seed: batch.id,
				...(addressees ? { addressees } : {}),
				...(participant ? { participant } : {}),
				...(targetRef ? { targetRef } : {}),
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
			// Async surfaces have no stale restart: the claim is the composition boundary, and a
			// reply composed against the claim-time transcript crosses a newer learner message in
			// transit. isStaleGeneration and the re-engage delay stay live-only.
			const staleGeneration =
				!endedByMaxTurns &&
				!isAsyncSurface(task.ui) &&
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
		const terminated = result.parsedResult.decision === "terminate_abuse";
		await db.transaction(async (tx) => {
			// Settlement reads sibling batches and writes message flags, so the terminal transition
			// locks the session row before touching the batch (session -> batch -> delivery): two
			// siblings ending simultaneously serialize, and exactly one of them performs the final write.
			// The lock also makes the world guard transactional: a session that reached max turns
			// between the generation finishing and this transaction is seen as ended, and a world
			// batch still generating then persists as cancelled, with no deliveries.
			const [lockedSession] = await tx
				.select({ status: practiceSession.status })
				.from(practiceSession)
				.where(eq(practiceSession.id, batch.sessionId))
				.for("update");
			const worldSessionEnded = batch.kind === "world" && lockedSession?.status !== "in_progress";
			const deliveries = worldSessionEnded ? [] : result.parsedResult.deliveries;
			const stillClaimed = await tx
				.update(agentResponseBatch)
				.set({
					status: worldSessionEnded ? "cancelled" : deliveries.length > 0 ? "delivery_pending" : terminated ? "terminated" : "no_reply",
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
			// A world batch cancelled by the ended-session guard keeps its generation evidence and
			// stops here: no abuse side effects, no deliveries — the guard outranks the decision, and
			// the replies max turns meant to spare must survive.
			if (worldSessionEnded) return;

			// Every no-delivery terminal state of a reply batch settles the message — a decision
			// whose deliveries were all filtered out ends as no_reply just the same. Other kinds
			// keep the live path's direct write.
			if (deliveries.length === 0 && !terminated && batch.inputMessageId !== null) {
				if (batch.kind === "reply") {
					// Arrival-based replies: the flags summarize every sibling taker of the message.
					await settleUserMessageFlags(tx, batch.inputMessageId);
				} else if (result.parsedResult.decision === "no_reply") {
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
				// The failure settlement writes message flags from sibling batches: lock the session
				// row first (session -> batch -> delivery), the same order as the other transitions.
				await tx.select({ id: practiceSession.id }).from(practiceSession).where(eq(practiceSession.id, batch.sessionId)).for("update");
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
					if (batch.kind === "reply") {
						// Arrival-based replies: the flags summarize every sibling taker of the message.
						await settleUserMessageFlags(tx, batch.inputMessageId);
					} else {
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
				with: { session: { columns: {}, with: { task: { columns: { id: true, ui: true, urgency: true, openingState: true } } } } },
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
				if (!session || !lockedBatch || !shouldDeliverIntoEndedSession(session, lockedBatch.status, batch.kind)) {
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
				const resolved = await this.resolveBatchReference(tx, ui, batch.id, delivery.replyTo);
				// A reply whose prerequisite was cancelled must not re-root as a top-level comment:
				// on a thread that would change its meaning, so it is dropped with the anomaly
				// recorded; a quoted chat delivers it without the quote instead.
				const targetMissing =
					isThreadedUi(ui) &&
					delivery.replyTo !== null &&
					(resolved === null || !(await replyTargetExists(tx, ui, batch.sessionId, batch.session?.task.openingState, resolved)));
				let replyTo = resolved;
				if (targetMissing) {
					await tx
						.update(agentDelivery)
						.set({ status: "cancelled" })
						.where(and(eq(agentDelivery.id, delivery.id), eq(agentDelivery.status, "delivered")));
					const providerMetadata = (batch.providerMetadata ?? {}) as { contractWarnings?: string[] };
					await tx
						.update(agentResponseBatch)
						.set({
							providerMetadata: {
								...providerMetadata,
								contractWarnings: [
									...(providerMetadata.contractWarnings ?? []),
									`Delivery ${delivery.sequence} replyTo ${delivery.replyTo} is missing its target; dropped`,
								],
							},
						})
						.where(eq(agentResponseBatch.id, batch.id));
					replyTo = null;
				}

				if (!targetMissing) {
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
				}

				const delivered = await tx
					.select({ count: drizzleSql<number>`count(*)::int` })
					.from(agentDelivery)
					.where(and(eq(agentDelivery.batchId, batch.id), eq(agentDelivery.status, "delivered")));
				const firstDelivered = (delivered[0]?.count ?? 0) === 1;
				if (firstDelivered) {
					if (batch.kind === "reply" && batch.inputMessageId !== null) await settleUserMessageFlags(tx, batch.inputMessageId);
					await this.createMailFollowOn(tx, batch, now);
				}

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
				if (batch.kind === "reply" && batch.inputMessageId !== null && (delivered[0]?.count ?? 0) === 0) {
					// Every delivery was dropped (missing targets): the message settles as if
					// nothing landed, instead of waiting forever.
					await settleUserMessageFlags(tx, batch.inputMessageId);
				}
				if (terminated) {
					await tx
						.update(practiceSession)
						.set({ status: "abandoned", completionReason: "terminated_abuse", completedAt: now })
						.where(and(eq(practiceSession.id, batch.sessionId), eq(practiceSession.status, "in_progress")));
				} else if (batch.kind === "world") {
					// A landed world moment may carry the activity on within the budget.
					await scheduleWorldMoment(tx, { sessionId: batch.sessionId, now, probability: WORLD_CONTINUATION_CHANCE });
				} else if (batch.allowIdleFollowUp) {
					await this.scheduleFollowUp(tx, batch.sessionId, now, batch.kind === "reply");
				}
			});
		}
	}

	/**
	 * An unread world moment waits: rescheduled on the idle cadence without spending a call. The
	 * claim incremented the generation count, so the reschedule hands it back — retries count
	 * only real generation attempts, and a thread the learner never returns to must not exhaust
	 * them. Bounded by session expiry: past the five-minute margin the moment is cancelled.
	 */
	private async skipUnwatchedWorld(
		executor: AgentReplyExecutor,
		batch: ClaimedBatch,
		session: { expiresAt: Date; task: { urgency?: Urgency | null } },
		now: WorkerNow,
	): Promise<void> {
		const dueAt = new Date(now.getTime() + worldIdleDelayMs(session.task.urgency ?? "high"));
		const reschedule = dueAt.getTime() <= session.expiresAt.getTime() - WORLD_MIN_BEFORE_EXPIRY_MS;
		await executor
			.update(agentResponseBatch)
			.set(
				reschedule
					? {
							status: "pending",
							dueAt,
							generationCount: batch.generationCount - 1,
							workerId: null,
							claimToken: null,
							claimedAt: null,
							leaseExpiresAt: null,
						}
					: { status: "cancelled", completedAt: now },
			)
			.where(this.batchClaimFence(batch));
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

	/**
	 * The preserved extra email becomes its own take-up once the first email has actually landed:
	 * the same participant and input message, delivery-pending with the one delivery pre-filled,
	 * on a clock that starts here. Never created when the parent's deliveries were all cancelled
	 * before any landed — the preserved content stays in the stored artifacts.
	 */
	private async createMailFollowOn(
		tx: SessionTx,
		batch: ClaimedBatch & { session?: { task: { ui: UiVariant; urgency: Urgency | null } } | null },
		now: WorkerNow,
	): Promise<void> {
		const preserved = (batch.parsedResult as { preservedFollowOn?: PreservedDelivery } | null)?.preservedFollowOn;
		if (!preserved || batch.session?.task.ui !== "apple_mail" || batch.inputMessageId === null) return;
		const dueAt = new Date(now.getTime() + sampleReplyDelayMs(batch.session.task.urgency ?? "high"));
		const [followOn] = await tx
			.insert(agentResponseBatch)
			.values({
				sessionId: batch.sessionId,
				kind: "reply",
				status: "delivery_pending",
				dueAt,
				participant: batch.participant,
				inputMessageId: batch.inputMessageId,
				targetRef: batch.targetRef,
				attempt: batch.attempt,
				inputVersion: batch.inputVersion,
			})
			.returning({ id: agentResponseBatch.id });
		await tx
			.insert(agentDelivery)
			.values({ batchId: followOn.id, sequence: 0, content: preserved.content, author: preserved.author, replyTo: preserved.replyTo, dueAt });
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
		const scene = resolveScene(task.ui, task.openingState, task.id, learner?.name || "Learner");
		// Idle life on async group scenes belongs to world moments, not follow-up batches; a
		// one-to-one scene keeps its nudge.
		if (isAsyncSurface(task.ui) && scene.group) return;
		const live = isLiveChat(task.ui, scene);
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
