import { randomUUID } from "node:crypto";
import { and, asc, sql as drizzleSql, eq, inArray, lte, ne } from "drizzle-orm";
import { getDeliveryDelayMs } from "$lib/async-replies/timing";
import { URGENCY_PRESETS, type Urgency } from "$lib/constants";
import { generateAgentResponse } from "$lib/server/async-replies/generator";
import { db } from "$lib/server/db";
import { agentDelivery, agentResponseBatch, practiceSession, sessionMessage } from "$lib/server/db/schema";

export const DEFAULT_WORKER_SCAN_INTERVAL_MS = 1_000;
export const DEFAULT_WORKER_LEASE_MS = 30_000;
export const DEFAULT_WORKER_CONCURRENCY = 2;

type WorkerNow = Date;

export function getDeliveryDueAt(firstDueAt: Date, previousContent: string | undefined): Date {
	return new Date(firstDueAt.getTime() + (previousContent === undefined ? 0 : getDeliveryDelayMs(previousContent)));
}

export function isStaleGeneration(input: { expectedInputMessageId: number | null; latestUserMessageId: number | null; sessionStatus: string }) {
	return (
		input.sessionStatus !== "in_progress" ||
		(input.expectedInputMessageId !== null && input.latestUserMessageId !== null && input.latestUserMessageId > input.expectedInputMessageId)
	);
}

function safeError(error: unknown): string {
	return error instanceof Error && error.message.trim() ? error.message.slice(0, 500) : "The AI reply could not be generated.";
}

export function getUrgencyFollowUpAt(now: Date, urgency: Urgency, followUpCount: number): Date {
	return new Date(now.getTime() + URGENCY_PRESETS[urgency].idleFollowUpDelayMs * Math.max(1, followUpCount));
}

export type AsyncReplyWorkerOptions = {
	workerId?: string;
	leaseMs?: number;
	scanIntervalMs?: number;
	concurrency?: number;
};

export class AsyncReplyWorker {
	private readonly workerId: string;
	private readonly leaseMs: number;
	private readonly scanIntervalMs: number;
	private readonly concurrency: number;
	private timer: ReturnType<typeof setInterval> | undefined;
	private stopping = false;

	constructor(options: AsyncReplyWorkerOptions = {}) {
		this.workerId = options.workerId ?? `async-replies-${randomUUID()}`;
		this.leaseMs = options.leaseMs ?? DEFAULT_WORKER_LEASE_MS;
		this.scanIntervalMs = options.scanIntervalMs ?? DEFAULT_WORKER_SCAN_INTERVAL_MS;
		this.concurrency = options.concurrency ?? DEFAULT_WORKER_CONCURRENCY;
	}

	get id() {
		return this.workerId;
	}

	async runOnce(now: WorkerNow = new Date()): Promise<void> {
		await this.expireSessions(now);
		await this.reclaimExpiredLeases(now);

		const claimed: Array<typeof agentResponseBatch.$inferSelect> = [];
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
			if (this.stopping) return;
			void this.runOnce().catch((error) => console.error("async reply worker tick failed", error));
		}, this.scanIntervalMs);
		void this.runOnce().catch((error) => console.error("async reply worker initial tick failed", error));
	}

	async stop(): Promise<void> {
		this.stopping = true;
		if (this.timer) clearInterval(this.timer);
		this.timer = undefined;
	}

	private async expireSessions(now: Date): Promise<void> {
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

	private async reclaimExpiredLeases(now: Date): Promise<void> {
		await db
			.update(agentResponseBatch)
			.set({ status: "pending", workerId: null, claimToken: null, claimedAt: null, leaseExpiresAt: null })
			.where(and(eq(agentResponseBatch.status, "processing"), lte(agentResponseBatch.leaseExpiresAt, now)));
	}

	private async claimDueBatch(now: Date): Promise<typeof agentResponseBatch.$inferSelect | null> {
		const claimToken = randomUUID();
		const leaseExpiresAt = new Date(now.getTime() + this.leaseMs);
		const result = await db.execute(drizzleSql`
			UPDATE agent_response_batch
			SET status = 'processing', worker_id = ${this.workerId}, claim_token = ${claimToken}, claimed_at = ${now}, lease_expires_at = ${leaseExpiresAt}, generation_count = generation_count + 1
			WHERE id = (
				SELECT id FROM agent_response_batch
				WHERE status = 'pending' AND due_at <= ${now}
				ORDER BY due_at ASC, id ASC
				FOR UPDATE SKIP LOCKED
				LIMIT 1
			)
			RETURNING *
		`);
		const row = (result as unknown as Array<typeof agentResponseBatch.$inferSelect>)[0];
		return row ?? null;
	}

	private async processBatch(batch: typeof agentResponseBatch.$inferSelect, now: Date): Promise<void> {
		const session = await db.query.practiceSession.findFirst({
			where: eq(practiceSession.id, batch.sessionId),
			with: { task: true, messages: { orderBy: [asc(sessionMessage.createdAt), asc(sessionMessage.id)] } },
		});
		if (!session || session.status !== "in_progress") {
			await db.update(agentResponseBatch).set({ status: "cancelled", completedAt: now }).where(eq(agentResponseBatch.id, batch.id));
			return;
		}

		const history = session.messages.filter((message) => message.role === "user" || message.role === "assistant");
		const latestUserMessageId = [...history].reverse().find((message) => message.role === "user")?.id ?? null;
		const expectedInputMessageId = batch.inputMessageId ?? latestUserMessageId;
		if (expectedInputMessageId !== batch.inputMessageId) {
			await db.update(agentResponseBatch).set({ inputMessageId: expectedInputMessageId }).where(eq(agentResponseBatch.id, batch.id));
		}

		try {
			const result = await generateAgentResponse({
				baseSystemPrompt: (session.agentPromptSnapshot as { systemPrompt: string }).systemPrompt,
				ui: (session.agentPromptSnapshot as { ui?: Parameters<typeof generateAgentResponse>[0]["ui"] }).ui ?? "discord",
				history,
				userId: session.userId,
			});
			const freshSession = await db.query.practiceSession.findFirst({ where: eq(practiceSession.id, session.id), columns: { status: true } });
			const freshMessages = await db.query.sessionMessage.findMany({
				where: and(eq(sessionMessage.sessionId, session.id), eq(sessionMessage.role, "user")),
				orderBy: [asc(sessionMessage.createdAt), asc(sessionMessage.id)],
			});
			const freshLatestUserMessageId = freshMessages.at(-1)?.id ?? null;
			if (
				isStaleGeneration({
					expectedInputMessageId,
					latestUserMessageId: freshLatestUserMessageId,
					sessionStatus: freshSession?.status ?? "completed",
				})
			) {
				await db
					.update(agentResponseBatch)
					.set({
						status: "pending",
						dueAt: new Date(now.getTime() + 2_000),
						staleCount: batch.staleCount + 1,
						workerId: null,
						claimToken: null,
						leaseExpiresAt: null,
					})
					.where(eq(agentResponseBatch.id, batch.id));
				return;
			}

			const deliveries = result.parsedResult.deliveries;
			const terminated = result.parsedResult.decision === "terminate_abuse";
			await db.transaction(async (tx) => {
				await tx
					.update(agentResponseBatch)
					.set({
						status: deliveries.length > 0 ? "delivery_pending" : terminated ? "terminated" : "no_reply",
						requestMessages: result.requestMessages,
						rawResponse: result.rawResponse,
						parsedResult: result.parsedResult,
						providerMetadata: result.providerMetadata,
						allowIdleFollowUp: result.parsedResult.allowIdleFollowUp,
						completedAt: deliveries.length > 0 ? null : now,
						workerId: null,
						claimToken: null,
						leaseExpiresAt: null,
					})
					.where(eq(agentResponseBatch.id, batch.id));
				if (terminated) {
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
			});
			if (deliveries.length === 0 && result.parsedResult.allowIdleFollowUp && !terminated) {
				await this.scheduleFollowUp(db, batch.sessionId, now, session.urgency);
			}
		} catch (error) {
			await db
				.update(agentResponseBatch)
				.set({ status: "failed", error: safeError(error), completedAt: now, workerId: null, claimToken: null, leaseExpiresAt: null })
				.where(eq(agentResponseBatch.id, batch.id));
		}
	}

	private async deliverDueMessages(now: Date): Promise<void> {
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
				columns: { status: true, urgency: true },
			});
			if (!session || session.status !== "in_progress") {
				await db
					.update(agentDelivery)
					.set({ status: "cancelled" })
					.where(and(eq(agentDelivery.id, delivery.id), eq(agentDelivery.status, "pending")));
				continue;
			}
			const claimed = await db
				.update(agentDelivery)
				.set({ status: "delivered", deliveredAt: now })
				.where(and(eq(agentDelivery.id, delivery.id), eq(agentDelivery.status, "pending")))
				.returning({ id: agentDelivery.id });
			if (claimed.length === 0) continue;

			await db.insert(sessionMessage).values({
				sessionId: batch.sessionId,
				role: "assistant",
				content: delivery.content,
				responseBatchId: batch.id,
				deliveryId: delivery.id,
				llmMetadata: { replyToMessageId: delivery.replyToMessageId, asyncDelivery: true },
			});

			const remaining = await db.query.agentDelivery.findFirst({
				where: and(eq(agentDelivery.batchId, batch.id), eq(agentDelivery.status, "pending")),
			});
			if (!remaining) {
				await db
					.update(agentResponseBatch)
					.set({
						status: batch.parsedResult && (batch.parsedResult as { decision?: string }).decision === "terminate_abuse" ? "terminated" : "completed",
						completedAt: now,
					})
					.where(eq(agentResponseBatch.id, batch.id));
				if (batch.allowIdleFollowUp) {
					await this.scheduleFollowUp(db, batch.sessionId, now, session.urgency);
				}
			}
		}
	}

	private async scheduleFollowUp(executor: typeof db, sessionId: number, now: Date, urgency: Urgency): Promise<void> {
		const session = await executor.query.practiceSession.findFirst({ where: eq(practiceSession.id, sessionId) });
		if (!session || session.status !== "in_progress" || session.followUpCount >= 2 || session.expiresAt <= now) return;
		const existing = await executor.query.agentResponseBatch.findFirst({
			where: and(eq(agentResponseBatch.sessionId, sessionId), inArray(agentResponseBatch.status, ["pending", "processing", "delivery_pending"])),
		});
		if (existing) return;
		await executor
			.update(practiceSession)
			.set({ followUpCount: session.followUpCount + 1 })
			.where(and(eq(practiceSession.id, sessionId), eq(practiceSession.followUpCount, session.followUpCount)));
		await executor.insert(agentResponseBatch).values({
			sessionId,
			kind: "follow_up",
			status: "pending",
			dueAt: getUrgencyFollowUpAt(now, urgency, session.followUpCount + 1),
			inputMessageId: null,
		});
	}
}
