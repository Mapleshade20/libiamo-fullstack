import { type AnyColumn, and, asc, sql as drizzleSql, eq, inArray, isNull, ne, type SQL } from "drizzle-orm";
import {
	type CommentThreadMetadata,
	joinedConversation,
	type PendingConversation,
	persistedMessageRef,
	targetRefOf,
} from "#lib/exchange/comment-thread.ts";
import { EXCHANGE_MAX_AGE_SECONDS } from "#lib/exchange/limits.ts";
import { type ChatMessage, foldedChainIds } from "#lib/exchange/messages.ts";
import { getSessionExpiry, RE_ENGAGE_DELAY_MS, sampleReplyDelayMs } from "#lib/exchange/reply-timing.ts";
import { isAsyncSurface, resolveScene } from "#lib/exchange/scene.ts";
import type { Stop } from "#lib/llm/stops.ts";
import { SITE_OF } from "#lib/scenario/types.ts";
import { addressedCastParticipants, allocateParticipants, drawTakerCount } from "#lib/server/exchange/agents/floor.ts";
import { scheduleWorldMoment } from "#lib/server/exchange/agents/worker.ts";
import { buildSceneTranscript } from "#lib/server/exchange/prompt-context.ts";
import { db } from "../db/index.ts";
import { agentBatch, agentDelivery, exchange, exchangeMessage, piece, user } from "../db/schema.ts";
import { type Setting, settingOf } from "./setting.ts";

export const sessionMessageChronologicalOrder = [asc(exchangeMessage.createdAt), asc(exchangeMessage.id)];

export function orderSessionMessagesChronologically<T extends { createdAt: AnyColumn; id: AnyColumn }>(
	messages: T,
	operators: { asc: (column: AnyColumn) => SQL },
) {
	return [operators.asc(messages.createdAt), operators.asc(messages.id)];
}

/** Message rows as the comment-id scheme sees them, for conversation joins. */
function toSceneMessages(messages: ArrivalMessage[], learnerName: string): ChatMessage[] {
	return messages.map((message) => {
		const metadata = getMessageMetadata(message.llmMetadata);
		return {
			id: String(message.id),
			role: message.role === "user" ? "user" : "agent",
			text: message.content,
			timestamp: "",
			authorName: message.role === "user" ? learnerName : String(metadata.assistantAuthorName ?? ""),
			clientMessageId: typeof metadata.clientMessageId === "string" ? metadata.clientMessageId : undefined,
			thread: (metadata.thread ?? undefined) as CommentThreadMetadata | undefined,
		};
	});
}

/** The head plus every message folded into it, transitively. */
function foldedChainOf(messages: ArrivalMessage[], headId: number): ArrivalMessage[] {
	const ids = foldedChainIds(messages, headId);
	return messages.filter((message) => ids.has(message.id));
}

/** The batches serving one input message that have delivered anything. */
async function deliveredBatchIds(tx: SubmitTx, exchangeId: number, inputMessageId: number): Promise<Set<number>> {
	const batches = await tx.query.agentBatch.findMany({
		where: and(eq(agentBatch.exchangeId, exchangeId), eq(agentBatch.inputMessageId, inputMessageId)),
		columns: { id: true },
	});
	if (batches.length === 0) return new Set();
	const rows = await tx
		.select({ batchId: agentDelivery.batchId })
		.from(agentDelivery)
		.where(
			and(
				inArray(
					agentDelivery.batchId,
					batches.map((batch) => batch.id),
				),
				eq(agentDelivery.status, "delivered"),
			),
		);
	return new Set(rows.map((row) => row.batchId));
}

/** Outstanding reply batches serving one conversation target. */
async function countOutstandingTargetBatches(tx: SubmitTx, exchangeId: number, targetRef: string | null): Promise<number> {
	const rows = await tx
		.select({ count: drizzleSql<number>`count(*)::int` })
		.from(agentBatch)
		.where(
			and(
				eq(agentBatch.exchangeId, exchangeId),
				eq(agentBatch.kind, "reply"),
				inArray(agentBatch.status, ["pending", "processing", "stale", "delivery_pending"]),
				targetRef === null ? isNull(agentBatch.targetRef) : eq(agentBatch.targetRef, targetRef),
			),
		);
	return rows[0]?.count ?? 0;
}

/**
 * The arrival-based submit path (reddit, ao3, mail): one batch is one participant's take-up of
 * one conversation target. A supplement joins the pending conversation it answers and re-targets
 * its takers — folding the conversation's earlier heads into the new message unless a reply of
 * their own already landed or a taker of theirs is still composing — while a new exchange gets a
 * freshly allocated taker set on independently sampled clocks; a message that directly addresses
 * someone the takers do not cover adds that participant's taker, and a group scene may see one
 * world moment overlap the pending reply wave. A manual retry draws exactly one fresh
 * participant, excluding whoever already delivered for the message.
 */
async function scheduleArrivalTakeUp(
	tx: SubmitTx,
	input: {
		session: {
			id: number;
			messages: ArrivalMessage[];
			setting: Setting;
		};
		learnerName: string;
		/** The input message (new or revived), with its final metadata. */
		message: ArrivalMessage;
		isRetry: boolean;
		now: Date;
	},
): Promise<void> {
	const { session, message } = input;
	await scheduleTakers(tx, input);
	// Nobody took the message up (the target's takers are all busy composing or delivering, or the
	// draw came back empty): it settles as unanswered now, or its placeholder would wait forever.
	const [serving] = await tx
		.select({ count: drizzleSql<number>`count(*)::int` })
		.from(agentBatch)
		.where(
			and(
				eq(agentBatch.exchangeId, session.id),
				eq(agentBatch.kind, "reply"),
				eq(agentBatch.inputMessageId, message.id),
				inArray(agentBatch.status, ["pending", "processing", "stale", "delivery_pending"]),
			),
		);
	if ((serving?.count ?? 0) === 0) {
		await tx
			.update(exchangeMessage)
			.set({ llmMetadata: { ...getMessageMetadata(message.llmMetadata), noReply: true, failed: false, failureStop: null } })
			.where(eq(exchangeMessage.id, message.id));
	}
}

async function scheduleTakers(tx: SubmitTx, input: Parameters<typeof scheduleArrivalTakeUp>[1]): Promise<void> {
	const { session, learnerName, message, now } = input;
	const task = session.setting;
	const messageMetadata = getMessageMetadata(message.llmMetadata);
	const thread = (messageMetadata.thread ?? undefined) as CommentThreadMetadata | undefined;
	const targetRef = targetRefOf({ thread });
	const attempt = typeof messageMetadata.attempt === "number" ? messageMetadata.attempt : 0;
	const scene = resolveScene(task.ui, task.openingState, task.id, learnerName);
	const history: ArrivalMessage[] = [
		...session.messages.filter((existing) => existing.role === "user" || existing.role === "assistant"),
		...(session.messages.some((existing) => existing.id === message.id) ? [] : [message]),
	];
	const { entries, refs } = buildSceneTranscript({ ui: task.ui, openingState: task.openingState, messages: history, learnerName, scene });
	// The conversation target names the thread box this exchange lives in; the allocation
	// target is the learner's own message, whose branch scopes the candidate pool.
	const messageRef = persistedMessageRef(task.ui, message);
	const allocationTarget = entries[refs.indexOf(messageRef)] ?? entries.findLast((entry) => entry.role === "learner");

	const insertTaker = async (participant: string, batchTargetRef: string | null) => {
		await tx.insert(agentBatch).values({
			exchangeId: session.id,
			kind: "reply",
			status: "pending",
			dueAt: new Date(now.getTime() + sampleReplyDelayMs(task.urgency ?? "high")),
			inputMessageId: message.id,
			inputVersion: 1,
			participant,
			targetRef: batchTargetRef,
			attempt,
		});
	};

	// The takers still to take up, grouped into the conversations they serve.
	const reTargetable = await tx.query.agentBatch.findMany({
		where: and(eq(agentBatch.exchangeId, session.id), eq(agentBatch.kind, "reply"), inArray(agentBatch.status, ["pending", "stale"])),
		columns: { id: true, targetRef: true, inputMessageId: true, participant: true },
	});
	const conversations: PendingConversation[] = [];
	for (const key of new Set(reTargetable.map((batch) => batch.targetRef))) {
		const learnerRefs = new Set<string>();
		for (const batch of reTargetable) {
			if (batch.targetRef !== key || batch.inputMessageId === null) continue;
			for (const folded of foldedChainOf(history, batch.inputMessageId)) learnerRefs.add(persistedMessageRef(task.ui, folded));
		}
		conversations.push({ targetRef: key, learnerRefs: [...learnerRefs] });
	}
	const joined = joinedConversation(task.ui, toSceneMessages(history, learnerName), conversations, targetRef);

	if (input.isRetry) {
		if (!allocationTarget) return;
		// Exclude whoever already delivered for this message; a repeat draw across sets is fine.
		const delivered = await deliveredBatchIds(tx, session.id, message.id);
		const servedBy = await tx.query.agentBatch.findMany({
			where: and(eq(agentBatch.exchangeId, session.id), eq(agentBatch.inputMessageId, message.id), eq(agentBatch.kind, "reply")),
			columns: { id: true, participant: true, targetRef: true },
		});
		const exclude = servedBy.filter((batch) => delivered.has(batch.id) && batch.participant).map((batch) => batch.participant as string);
		// The retry serves the conversation the message's takers already served, not whatever
		// the message itself happened to reply to.
		const conversationRef = servedBy.find((batch) => batch.targetRef !== null)?.targetRef ?? targetRef;
		const drawn = allocateParticipants({
			ui: task.ui,
			language: task.language,
			entries,
			scene,
			learnerName,
			seed: message.id,
			count: 1,
			target: allocationTarget,
			exclude,
		});
		if (drawn[0]) await insertTaker(drawn[0], conversationRef);
		return;
	}

	const pendingParticipants = new Set<string>();
	if (joined) {
		// The conversation's takers have not taken up yet, so they take up the supplemented
		// question: same people, same clocks, now serving the new head.
		await tx
			.update(agentBatch)
			.set({ inputMessageId: message.id, inputVersion: drizzleSql`${agentBatch.inputVersion} + 1`, attempt, status: "pending" })
			.where(
				and(
					eq(agentBatch.exchangeId, session.id),
					eq(agentBatch.kind, "reply"),
					inArray(agentBatch.status, ["pending", "stale"]),
					joined.targetRef === null ? isNull(agentBatch.targetRef) : eq(agentBatch.targetRef, joined.targetRef),
				),
			);
		const joinedGroup = reTargetable.filter((batch) => batch.targetRef === joined.targetRef);
		for (const batch of joinedGroup) if (batch.participant) pendingParticipants.add(batch.participant);
		// The conversation's earlier heads fold into the new message unless a reply of their own
		// already landed or a taker of theirs is still composing; earlier chains follow their head.
		for (const headId of [
			...new Set(joinedGroup.map((batch) => batch.inputMessageId).filter((id): id is number => id !== null && id !== message.id)),
		]) {
			const headBatches = await tx.query.agentBatch.findMany({
				where: and(eq(agentBatch.exchangeId, session.id), eq(agentBatch.inputMessageId, headId)),
				columns: { id: true, status: true },
			});
			const delivered = await deliveredBatchIds(tx, session.id, headId);
			const answered = headBatches.some((batch) => delivered.has(batch.id));
			const stillServing = headBatches.some(
				(batch) => batch.status === "pending" || batch.status === "processing" || batch.status === "stale" || batch.status === "delivery_pending",
			);
			if (answered || stillServing) continue;
			for (const folded of foldedChainOf(history, headId)) {
				await tx
					.update(exchangeMessage)
					.set({ llmMetadata: { ...getMessageMetadata(folded.llmMetadata), foldedInto: message.id } })
					.where(eq(exchangeMessage.id, folded.id));
			}
		}
	} else if (allocationTarget) {
		// A new exchange: distinct participants, each on its own independently sampled clock, within the cap.
		const outstanding = await countOutstandingTargetBatches(tx, session.id, targetRef);
		const room = Math.max(0, TAKER_CAP - outstanding);
		const count = scene.group ? Math.min(drawTakerCount(task.ui, message.id), room) : Math.min(1, room);
		const drawn = allocateParticipants({
			ui: task.ui,
			language: task.language,
			entries,
			scene,
			learnerName,
			seed: message.id,
			count,
			target: allocationTarget,
		});
		for (const participant of drawn) {
			await insertTaker(participant, targetRef);
			pendingParticipants.add(participant);
		}
	}

	// Someone the message directly addresses, whom its takers do not cover, gets a taker of their own —
	// within the conversation the message joined, which keeps its target.
	const conversationRef = joined ? joined.targetRef : targetRef;
	for (const participant of addressedCastParticipants({ task, scene, learnerName, content: message.content, thread, messages: history })) {
		if (pendingParticipants.has(participant)) continue;
		if ((await countOutstandingTargetBatches(tx, session.id, conversationRef)) >= TAKER_CAP) break;
		await insertTaker(participant, conversationRef);
		pendingParticipants.add(participant);
	}

	// A group scene may see one world moment overlap the pending reply wave, within the budget.
	if (scene.group) await scheduleWorldMoment(tx, { exchangeId: session.id, now, probability: 0.3 });

	// The learner came back: a pending idle nudge is spent. World moments are untouched.
	await tx
		.update(agentBatch)
		.set({ status: "cancelled", completedAt: now })
		.where(and(eq(agentBatch.exchangeId, session.id), eq(agentBatch.kind, "follow_up"), ne(agentBatch.status, "processing")));

	// Async groups live on world moments, not idle nudges; a learner message starts the silence over.
	if (scene.group) await tx.update(exchange).set({ followUpCount: 0 }).where(eq(exchange.id, session.id));
}

/**
 * Opens the exchange of a scenario: its piece (`writing`, the plan typed on the scenario page, which the page keeps on the
 * device until now, as its background) and the exchange, in one transaction. A learner has at most one unfinished piece of a scenario (a partial unique index), so entering
 * again returns the one already open.
 */
export async function openExchange(
	u: { id: string; tutorLanguage: string; nativeLanguage?: string | null },
	s: Setting,
	plan = "",
): Promise<{ exchangeId: number; pieceId: string }> {
	const startedAt = new Date();
	return db.transaction(async (tx) => {
		const [open] = await tx
			.select({ exchangeId: exchange.id, pieceId: piece.id })
			.from(piece)
			.innerJoin(exchange, eq(exchange.pieceId, piece.id))
			.where(and(eq(piece.userId, u.id), eq(piece.scenarioId, s.id), inArray(piece.state, ["writing", "revising"])));
		if (open) return open;
		const [p] = await tx
			.insert(piece)
			.values({
				userId: u.id,
				language: s.language,
				kind: "scenario",
				scenarioId: s.id,
				place: SITE_OF[s.ui],
				title: s.title,
				text: "",
				background: plan.trim() || null,
				tutorLanguage: u.tutorLanguage === "target" ? s.language : (u.nativeLanguage ?? "en"),
				state: "writing",
			})
			.returning({ id: piece.id });
		const [e] = await tx
			.insert(exchange)
			.values({
				userId: u.id,
				pieceId: p.id,
				scenarioId: s.id,
				startedAt,
				expiresAt: getSessionExpiry(startedAt, EXCHANGE_MAX_AGE_SECONDS),
				status: "in_progress",
			})
			.returning({ id: exchange.id });
		return { exchangeId: e.id, pieceId: p.id };
	});
}

type SubmitMessageResult =
	| { turnCount: number; pending: true }
	/** The send itself completed the session (e.g. the maxTurns message); clients must navigate instead of calling complete. */
	| { turnCount: number; pending: false; sessionCompleted: true; completionReason: "max_turns" };

type SessionMessageMetadata = {
	clientMessageId?: string;
	failed?: boolean;
	failureStop?: Stop | null;
	hidden?: boolean;
	displayContent?: string;
	assistantAuthorName?: string;
	thread?: CommentThreadMetadata;
	/** The manual retry counter: settlement scopes a message's sibling batches by it. */
	attempt?: number;
	/** Arrival-based surfaces: this message's wait settles within its own conversation. */
	arrival?: boolean;
	/** Arrival-based replies: this message folded into the head of its conversation. */
	foldedInto?: number;
};

type SubmitTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** A session message as the arrival path reads it. */
type ArrivalMessage = { id: number; role: string; content: string; createdAt: Date; llmMetadata: unknown };

/** At most this many outstanding reply batches serve one conversation target. */
const TAKER_CAP = 3;

function getMessageMetadata(value: unknown): SessionMessageMetadata {
	if (!value || typeof value !== "object" || Array.isArray(value)) return {};
	return value as SessionMessageMetadata;
}

function isHiddenUserMessage(message: { role: string; llmMetadata?: unknown }): boolean {
	return message.role === "user" && getMessageMetadata(message.llmMetadata).hidden === true;
}

function countVisibleUserTurns(messages: Array<{ role: string; llmMetadata?: unknown }>): number {
	return messages.filter((message) => message.role === "user" && !isHiddenUserMessage(message)).length;
}

export type SubmitMessageOptions = {
	userDisplayContent?: string;
	userMetadata?: Record<string, unknown>;
};

export async function submitMessage(
	exchangeId: number,
	userMessage: string,
	userId: string,
	clientMessageId?: string,
	options: SubmitMessageOptions = {},
): Promise<SubmitMessageResult> {
	const trimmedUserMessage = userMessage.trim();
	if (!trimmedUserMessage) throw new Error("userMessage is required");
	const displayContent = options.userDisplayContent?.trim();
	const now = new Date();

	return db.transaction(async (tx) => {
		// Row lock that serializes concurrent submissions for the same session
		// (double send, retry, second tab): without it two transactions read the
		// same snapshot, both insert their learner message, both observe no active
		// batch, and both schedule one — duplicating messages and generated replies
		// and letting the turn count drift past maxTurns. Lock order here is
		// session -> batch -> delivery, matching the worker's delivery transaction.
		const [locked] = await tx
			.select({ id: exchange.id })
			.from(exchange)
			.where(and(eq(exchange.id, exchangeId), eq(exchange.userId, userId)))
			.for("update");
		if (!locked) throw new Error("Session not found");
		const session = await tx.query.exchange.findFirst({
			where: and(eq(exchange.id, exchangeId), eq(exchange.userId, userId)),
			with: { messages: { orderBy: sessionMessageChronologicalOrder } },
		});
		if (!session) throw new Error("Session not found");
		// Past its expiry the place is closed, though the worker's sweep (every half minute) may not have said so yet.
		if (session.status !== "in_progress" || session.expiresAt <= now) throw new Error("Session not in progress");
		const setting = await settingOf(tx, exchangeId);
		const asyncSurface = isAsyncSurface(setting.ui);

		let revivedMessageId: number | null = null;
		let isRetry = false;
		let revivedMetadata: SessionMessageMetadata | null = null;
		if (clientMessageId) {
			const existing = session.messages.find(
				(message) => message.role === "user" && getMessageMetadata(message.llmMetadata).clientMessageId === clientMessageId,
			);
			if (existing) {
				const existingMetadata = getMessageMetadata(existing.llmMetadata);
				// A folded message offers no retry of its own; the head's retry serves the whole chain.
				if (existingMetadata.failed !== true || typeof existingMetadata.foldedInto === "number") {
					return { turnCount: countVisibleUserTurns(session.messages), pending: true };
				}
				// A failed generation is terminal; a manual retry clears the failure and schedules a fresh batch.
				if (asyncSurface) {
					// The retry counter scopes settlement: the fresh taker concludes on its own, without
					// inheriting the failed rows it supersedes. A pre-marker message gains the arrival flag,
					// so its wait settles within its conversation from here on.
					revivedMetadata = { ...existingMetadata, failed: false, failureStop: null, attempt: (existingMetadata.attempt ?? 0) + 1, arrival: true };
					isRetry = true;
				} else {
					revivedMetadata = { ...existingMetadata, failed: false, failureStop: null };
				}
				await tx.update(exchangeMessage).set({ llmMetadata: revivedMetadata }).where(eq(exchangeMessage.id, existing.id));
				revivedMessageId = existing.id;
			}
		}

		let inputMessageId = revivedMessageId;
		let insertedMetadata: SessionMessageMetadata | undefined;
		if (!inputMessageId) {
			insertedMetadata =
				clientMessageId || displayContent || options.userMetadata || asyncSurface
					? { ...options.userMetadata, clientMessageId, displayContent, ...(asyncSurface ? { arrival: true } : {}) }
					: undefined;
			const inserted = await tx
				.insert(exchangeMessage)
				.values({
					exchangeId,
					role: "user",
					content: trimmedUserMessage,
					llmMetadata: insertedMetadata,
				})
				.returning({ id: exchangeMessage.id });
			inputMessageId = inserted[0]?.id ?? null;
			if (!inputMessageId) throw new Error("Failed to persist message");
		}

		const turnCount = countVisibleUserTurns(session.messages) + (revivedMessageId !== null ? 0 : 1);
		const maxTurns = setting.maxTurns;
		if (maxTurns && turnCount >= maxTurns) {
			await tx.update(exchange).set({ status: "completed", completionReason: "max_turns", completedAt: now }).where(eq(exchange.id, exchangeId));
			const activeBatches = await tx.query.agentBatch.findMany({
				where: and(eq(agentBatch.exchangeId, exchangeId), inArray(agentBatch.status, ["pending", "processing", "stale", "delivery_pending"])),
				columns: { id: true, status: true, kind: true },
			});
			// On async surfaces, world activity ends with the learner's turn — outstanding world
			// batches and their queued deliveries are cancelled whatever the sparing decision —
			// and the farewell and sparing decisions consider reply batches only.
			const decisionBatches = asyncSurface ? activeBatches.filter((batch) => batch.kind === "reply") : activeBatches;
			const nothingWillDeliver = !decisionBatches.some((batch) => batch.status === "processing" || batch.status === "delivery_pending");
			// A session that never saw a single agent reply still gets one: its unclaimed
			// batch is spared so the reply arrives on the natural sampled clock, and when
			// nothing is scheduled at all (every batch failed or chose silence) a farewell
			// batch is queued right away. World comments are not replies: a session whose
			// only cast messages came from world moments is still owed its farewell.
			let neverReplied = !session.messages.some((message) => message.role === "assistant");
			if (asyncSurface && !neverReplied) {
				const assistantBatchIds = [
					...new Set(
						session.messages
							.filter((message) => message.role === "assistant" && message.responseBatchId !== null)
							.map((message) => message.responseBatchId as number),
					),
				];
				const worldSources = assistantBatchIds.length
					? new Set(
							(
								await tx.query.agentBatch.findMany({
									where: inArray(agentBatch.id, assistantBatchIds),
									columns: { id: true, kind: true },
								})
							)
								.filter((batch) => batch.kind === "world")
								.map((batch) => batch.id),
						)
					: new Set<number>();
				neverReplied = !session.messages.some(
					(message) => message.role === "assistant" && message.responseBatchId !== null && !worldSources.has(message.responseBatchId),
				);
			}
			const spareUnclaimed = neverReplied && nothingWillDeliver;
			const hasPending = decisionBatches.some((batch) => batch.status === "pending");
			if (asyncSurface) {
				const worldDelivering = activeBatches
					.filter((batch) => batch.kind === "world" && batch.status === "delivery_pending")
					.map((batch) => batch.id);
				await tx
					.update(agentBatch)
					.set({ status: "cancelled", completedAt: now })
					.where(
						and(
							eq(agentBatch.exchangeId, exchangeId),
							eq(agentBatch.kind, "world"),
							inArray(agentBatch.status, ["pending", "stale", "delivery_pending"]),
						),
					);
				if (worldDelivering.length > 0) {
					await tx
						.update(agentDelivery)
						.set({ status: "cancelled" })
						.where(and(inArray(agentDelivery.batchId, worldDelivering), eq(agentDelivery.status, "pending")));
				}
			}
			const cancelled = await tx
				.update(agentBatch)
				.set({ status: "cancelled", completedAt: now })
				.where(
					and(
						eq(agentBatch.exchangeId, exchangeId),
						inArray(agentBatch.status, spareUnclaimed && hasPending ? ["stale"] : ["pending", "stale"]),
						...(asyncSurface ? [ne(agentBatch.kind, "world")] : []),
					),
				)
				.returning({ id: agentBatch.id });
			// Replies the agent already composed (delivery_pending) or is still composing
			// (processing, held by a worker's claim fence) are left alive on purpose: the
			// turn limit ends the session, but the in-flight reply is still delivered
			// into it. Orphaned processing batches are cancelled later via lease reclaim.
			if (spareUnclaimed && !hasPending) {
				const farewellMetadata = getMessageMetadata(
					session.messages.find((message) => message.id === inputMessageId)?.llmMetadata ?? revivedMetadata ?? insertedMetadata ?? {},
				);
				await tx.insert(agentBatch).values({
					exchangeId,
					kind: "reply",
					status: "pending",
					dueAt: new Date(now.getTime() + RE_ENGAGE_DELAY_MS),
					inputMessageId,
					inputVersion: 1,
					...(asyncSurface
						? {
								attempt: typeof farewellMetadata.attempt === "number" ? farewellMetadata.attempt : 0,
								targetRef: targetRefOf({ thread: (farewellMetadata.thread ?? undefined) as CommentThreadMetadata | undefined }),
							}
						: {}),
				});
			}
			if (cancelled.length > 0) {
				await tx
					.update(agentDelivery)
					.set({ status: "cancelled" })
					.where(
						and(
							inArray(
								agentDelivery.batchId,
								cancelled.map((batch) => batch.id),
							),
							eq(agentDelivery.status, "pending"),
						),
					);
			}
			return { turnCount, pending: false, sessionCompleted: true, completionReason: "max_turns" };
		}

		if (asyncSurface) {
			const learner = await tx.query.user.findFirst({ where: eq(user.id, userId), columns: { name: true } });
			const inputMessage: ArrivalMessage =
				revivedMessageId !== null
					? {
							id: revivedMessageId,
							role: "user",
							content: session.messages.find((message) => message.id === revivedMessageId)?.content ?? trimmedUserMessage,
							createdAt: now,
							llmMetadata: revivedMetadata,
						}
					: { id: inputMessageId as number, role: "user", content: trimmedUserMessage, createdAt: now, llmMetadata: insertedMetadata };
			await scheduleArrivalTakeUp(tx, {
				session: { ...session, setting },
				learnerName: learner?.name || "Learner",
				message: inputMessage,
				isRetry,
				now,
			});
			return { turnCount, pending: true };
		}

		const dueAt = new Date(now.getTime() + sampleReplyDelayMs(setting.urgency));
		const activeBatch = await tx.query.agentBatch.findFirst({
			where: and(eq(agentBatch.exchangeId, exchangeId), inArray(agentBatch.status, ["pending", "processing", "stale", "delivery_pending"])),
		});
		if (activeBatch?.status === "delivery_pending") {
			// The agent had already composed a reply when the new message landed: it is
			// engaged, so re-engage quickly instead of restarting the full MTTH clock.
			const reEngageAt = new Date(now.getTime() + RE_ENGAGE_DELAY_MS);
			// The batch is cancelled before its deliveries so lock acquisition keeps
			// the session -> batch -> delivery order the delivery worker uses.
			await tx.update(agentBatch).set({ status: "cancelled", completedAt: now }).where(eq(agentBatch.id, activeBatch.id));
			await tx
				.update(agentDelivery)
				.set({ status: "cancelled" })
				.where(and(eq(agentDelivery.batchId, activeBatch.id), eq(agentDelivery.status, "pending")));
			await tx.insert(agentBatch).values({
				exchangeId,
				kind: "reply",
				status: "pending",
				dueAt: reEngageAt,
				inputMessageId,
				inputVersion: activeBatch.inputVersion + 1,
			});
		} else if (activeBatch && activeBatch.kind === "follow_up" && activeBatch.status !== "processing") {
			// The user came back before the idle nudge fired, so the silence condition
			// is gone: cancel the nudge and answer the new message on a fresh sampled
			// clock instead of folding into the idle batch's far-future due time.
			await tx.update(agentBatch).set({ status: "cancelled", completedAt: now }).where(eq(agentBatch.id, activeBatch.id));
			await tx.insert(agentBatch).values({
				exchangeId,
				kind: "reply",
				status: "pending",
				dueAt,
				inputMessageId,
				inputVersion: 1,
			});
		} else if (activeBatch) {
			// Additional messages in the same burst fold into the scheduled batch without
			// pushing its due time: the clock is anchored to the first message, so rapid
			// typing can never postpone the reply indefinitely.
			await tx
				.update(agentBatch)
				.set({
					...(activeBatch.status === "processing" ? {} : { status: "pending" as const }),
					inputMessageId,
					inputVersion: activeBatch.inputVersion + 1,
				})
				.where(eq(agentBatch.id, activeBatch.id));
		} else {
			await tx.insert(agentBatch).values({
				exchangeId,
				kind: "reply",
				status: "pending",
				dueAt,
				inputMessageId,
				inputVersion: 1,
			});
		}
		return { turnCount, pending: true };
	});
}

export async function completeSession(exchangeId: number): Promise<void> {
	const now = new Date();
	await db.transaction(async (tx) => {
		// The status check and the write must share one locked view of the row: the
		// turn limit (submitMessage), the expiry sweep, and abuse termination all end
		// sessions concurrently. Reading outside the transaction let this overwrite
		// their outcome — relabelling a max_turns completion the worker reads to spare
		// its final reply, or resurrecting an already-abandoned session as completed.
		// Lock order is session -> batch -> delivery, matching submitMessage.
		const [locked] = await tx.select({ id: exchange.id, status: exchange.status }).from(exchange).where(eq(exchange.id, exchangeId)).for("update");
		if (!locked) throw new Error("Session not found");
		if (locked.status !== "in_progress") throw new Error("Session not in progress");

		const cancellable = await tx.query.agentBatch.findMany({
			where: and(eq(agentBatch.exchangeId, exchangeId), inArray(agentBatch.status, ["pending", "processing", "stale", "delivery_pending"])),
			columns: { id: true },
		});
		await tx.update(exchange).set({ status: "completed", completionReason: "user_requested", completedAt: now }).where(eq(exchange.id, exchangeId));
		await tx
			.update(agentBatch)
			.set({ status: "cancelled", completedAt: now })
			.where(and(eq(agentBatch.exchangeId, exchangeId), inArray(agentBatch.status, ["pending", "processing", "stale", "delivery_pending"])));
		if (cancellable.length > 0) {
			await tx
				.update(agentDelivery)
				.set({ status: "cancelled" })
				.where(
					and(
						inArray(
							agentDelivery.batchId,
							cancellable.map((batch) => batch.id),
						),
						eq(agentDelivery.status, "pending"),
					),
				);
		}
	});
}

/** The learner's exchange, or null. */
export async function exchangeFor(exchangeId: number, userId: string) {
	const [row] = await db
		.select()
		.from(exchange)
		.where(and(eq(exchange.id, exchangeId), eq(exchange.userId, userId)));
	return row ?? null;
}
