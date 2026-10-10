import { type AnyColumn, and, asc, sql as drizzleSql, eq, inArray, isNull, ne, type SQL } from "drizzle-orm";
import { PRACTICE_SESSION_MAX_AGE_SECONDS, type UiVariant, type Urgency } from "$lib/constants";
import {
	type CommentThreadMetadata,
	flattenOpeningComments,
	getCommentId,
	joinedConversation,
	type PendingConversation,
	targetRefOf,
} from "$lib/practice/comment-thread";
import { parseMailAddress, parseMailMessage } from "$lib/practice/mail";
import type { ChatMessage } from "$lib/practice/messages";
import { getSessionExpiry, RE_ENGAGE_DELAY_MS, sampleReplyDelayMs } from "$lib/practice/reply-timing";
import { isAsyncSurface, resolveScene } from "$lib/practice/scene";
import { allocateParticipants, drawTakerCount, names } from "$lib/server/practice/agent-replies/floor";
import { scheduleWorldMoment } from "$lib/server/practice/agent-replies/worker";
import { buildSceneTranscript } from "$lib/server/practice/prompt-context";
import { db } from "../db";
import { user as authUser } from "../db/auth.schema";
import { agentDelivery, agentResponseBatch, practiceSession, sessionMessage, task } from "../db/schema";

export const sessionMessageChronologicalOrder = [asc(sessionMessage.createdAt), asc(sessionMessage.id)];

export function orderSessionMessagesChronologically<T extends { createdAt: AnyColumn; id: AnyColumn }>(
	messages: T,
	operators: { asc: (column: AnyColumn) => SQL },
) {
	return [operators.asc(messages.createdAt), operators.asc(messages.id)];
}

/** A message's scene ref, as the comment id scheme names it. */
function commentRefOf(ui: UiVariant, message: ArrivalMessage): string {
	const metadata = getMessageMetadata(message.llmMetadata);
	return getCommentId(ui, {
		id: String(message.id),
		role: message.role === "user" ? "user" : "agent",
		clientMessageId: typeof metadata.clientMessageId === "string" ? metadata.clientMessageId : undefined,
		thread: (metadata.thread ?? undefined) as CommentThreadMetadata | undefined,
	});
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

/** The head plus every message folded into it, transitively, with a cycle guard. */
function foldedChainOf(messages: ArrivalMessage[], headId: number): ArrivalMessage[] {
	const byHead = new Map<number, number[]>();
	for (const message of messages) {
		const foldedInto = getMessageMetadata(message.llmMetadata).foldedInto;
		if (typeof foldedInto === "number" && foldedInto !== message.id) byHead.set(foldedInto, [...(byHead.get(foldedInto) ?? []), message.id]);
	}
	const chain = [headId];
	const seen = new Set<number>([headId]);
	for (let at = 0; at < chain.length; at += 1) {
		for (const next of byHead.get(chain[at]) ?? []) {
			if (!seen.has(next)) {
				seen.add(next);
				chain.push(next);
			}
		}
	}
	return messages.filter((message) => seen.has(message.id));
}

/** The batches serving one input message that have delivered anything. */
async function deliveredBatchIds(tx: SubmitTx, sessionId: number, inputMessageId: number): Promise<Set<number>> {
	const batches = await tx.query.agentResponseBatch.findMany({
		where: and(eq(agentResponseBatch.sessionId, sessionId), eq(agentResponseBatch.inputMessageId, inputMessageId)),
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
async function countOutstandingTargetBatches(tx: SubmitTx, sessionId: number, targetRef: string | null): Promise<number> {
	const rows = await tx
		.select({ count: drizzleSql<number>`count(*)::int` })
		.from(agentResponseBatch)
		.where(
			and(
				eq(agentResponseBatch.sessionId, sessionId),
				eq(agentResponseBatch.kind, "reply"),
				inArray(agentResponseBatch.status, ["pending", "processing", "stale", "delivery_pending"]),
				targetRef === null ? isNull(agentResponseBatch.targetRef) : eq(agentResponseBatch.targetRef, targetRef),
			),
		);
	return rows[0]?.count ?? 0;
}

/** Whom the message directly addresses among the cast: its reply target, names it writes, or a mail recipient. */
function addressedCastParticipants(input: {
	task: { ui: UiVariant; openingState: Record<string, unknown> | null };
	scene: { cast: Array<{ name: string }> };
	learnerName: string;
	content: string;
	thread?: CommentThreadMetadata;
	messages: ArrivalMessage[];
}): string[] {
	const cast = new Set(input.scene.cast.map((person) => person.name));
	const addressed: string[] = [];
	const push = (name: string | null | undefined) => {
		if (name && cast.has(name) && name !== input.learnerName && !addressed.includes(name)) addressed.push(name);
	};
	if (input.task.ui === "apple_mail") {
		for (const entry of parseMailMessage(input.content).to.split(",")) push(parseMailAddress(entry).name);
		return addressed;
	}
	const targetCommentId = input.thread?.targetCommentId;
	if (targetCommentId) {
		const opening = flattenOpeningComments(input.task.ui as "reddit" | "ao3", input.task.openingState).find(
			(comment) => comment.id === targetCommentId,
		);
		if (opening) push(opening.author);
		else {
			const target = input.messages.find((message) => commentRefOf(input.task.ui, message) === targetCommentId);
			if (target?.role === "assistant") push(getMessageMetadata(target.llmMetadata).assistantAuthorName);
		}
	}
	for (const person of input.scene.cast) if (names(input.content, person.name)) push(person.name);
	return addressed;
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
			task: { id: number; ui: UiVariant; language: string; openingState: Record<string, unknown> | null; urgency: Urgency | null };
		};
		learnerName: string;
		/** The input message (new or revived), with its final metadata. */
		message: ArrivalMessage;
		isRetry: boolean;
		now: Date;
	},
): Promise<void> {
	const { session, learnerName, message, now } = input;
	const task = session.task;
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
	const messageRef = commentRefOf(task.ui, message);
	const allocationTarget = entries[refs.indexOf(messageRef)] ?? entries.findLast((entry) => entry.role === "learner");

	const insertTaker = async (participant: string, batchTargetRef: string | null) => {
		await tx.insert(agentResponseBatch).values({
			sessionId: session.id,
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
	const reTargetable = await tx.query.agentResponseBatch.findMany({
		where: and(
			eq(agentResponseBatch.sessionId, session.id),
			eq(agentResponseBatch.kind, "reply"),
			inArray(agentResponseBatch.status, ["pending", "stale"]),
		),
		columns: { id: true, targetRef: true, inputMessageId: true, participant: true },
	});
	const conversations: PendingConversation[] = [];
	for (const key of new Set(reTargetable.map((batch) => batch.targetRef))) {
		const learnerRefs = new Set<string>();
		for (const batch of reTargetable) {
			if (batch.targetRef !== key || batch.inputMessageId === null) continue;
			for (const folded of foldedChainOf(history, batch.inputMessageId)) learnerRefs.add(commentRefOf(task.ui, folded));
		}
		conversations.push({ targetRef: key, learnerRefs: [...learnerRefs] });
	}
	const joined = joinedConversation(task.ui, toSceneMessages(history, learnerName), conversations, targetRef);

	if (input.isRetry) {
		if (!allocationTarget) return;
		// Exclude whoever already delivered for this message; a repeat draw across sets is fine.
		const delivered = await deliveredBatchIds(tx, session.id, message.id);
		const servedBy = await tx.query.agentResponseBatch.findMany({
			where: and(
				eq(agentResponseBatch.sessionId, session.id),
				eq(agentResponseBatch.inputMessageId, message.id),
				eq(agentResponseBatch.kind, "reply"),
			),
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
			.update(agentResponseBatch)
			.set({ inputMessageId: message.id, inputVersion: drizzleSql`${agentResponseBatch.inputVersion} + 1`, attempt, status: "pending" })
			.where(
				and(
					eq(agentResponseBatch.sessionId, session.id),
					eq(agentResponseBatch.kind, "reply"),
					inArray(agentResponseBatch.status, ["pending", "stale"]),
					joined.targetRef === null ? isNull(agentResponseBatch.targetRef) : eq(agentResponseBatch.targetRef, joined.targetRef),
				),
			);
		const joinedGroup = reTargetable.filter((batch) => batch.targetRef === joined.targetRef);
		for (const batch of joinedGroup) if (batch.participant) pendingParticipants.add(batch.participant);
		// The conversation's earlier heads fold into the new message unless a reply of their own
		// already landed or a taker of theirs is still composing; earlier chains follow their head.
		for (const headId of [
			...new Set(joinedGroup.map((batch) => batch.inputMessageId).filter((id): id is number => id !== null && id !== message.id)),
		]) {
			const headBatches = await tx.query.agentResponseBatch.findMany({
				where: and(eq(agentResponseBatch.sessionId, session.id), eq(agentResponseBatch.inputMessageId, headId)),
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
					.update(sessionMessage)
					.set({ llmMetadata: { ...getMessageMetadata(folded.llmMetadata), foldedInto: message.id } })
					.where(eq(sessionMessage.id, folded.id));
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
	if (scene.group) await scheduleWorldMoment(tx, { sessionId: session.id, now, probability: 0.3 });

	// The learner came back: a pending idle nudge is spent. World moments are untouched.
	await tx
		.update(agentResponseBatch)
		.set({ status: "cancelled", completedAt: now })
		.where(and(eq(agentResponseBatch.sessionId, session.id), eq(agentResponseBatch.kind, "follow_up"), ne(agentResponseBatch.status, "processing")));

	// Async groups live on world moments, not idle nudges; a learner message starts the silence over.
	if (scene.group) await tx.update(practiceSession).set({ followUpCount: 0 }).where(eq(practiceSession.id, session.id));
}

/** Starts (or returns) the learner's session for a task within one lineup entry. */
export async function startSession(taskId: number, userId: string, lineupId: number | null): Promise<{ sessionId: number }> {
	const taskData = await db.query.task.findFirst({
		where: eq(task.id, taskId),
		columns: { interactionType: true },
	});
	if (!taskData || taskData.interactionType !== "chat") throw new Error("Task not found");

	const sameAttempt = and(
		eq(practiceSession.userId, userId),
		eq(practiceSession.taskId, taskId),
		lineupId === null ? isNull(practiceSession.lineupId) : eq(practiceSession.lineupId, lineupId),
	);
	const startedAt = new Date();
	const [session] = await db
		.insert(practiceSession)
		.values({
			userId,
			taskId,
			lineupId,
			startedAt,
			expiresAt: getSessionExpiry(startedAt, PRACTICE_SESSION_MAX_AGE_SECONDS),
			status: "in_progress",
		})
		.onConflictDoNothing()
		.returning({ id: practiceSession.id });
	if (session) return { sessionId: session.id };

	const existing = await db.query.practiceSession.findFirst({ where: sameAttempt, columns: { id: true } });
	if (!existing) throw new Error("Failed to create session");
	return { sessionId: existing.id };
}

type SubmitMessageResult =
	| { turnCount: number; pending: true }
	/** The send itself completed the session (e.g. the maxTurns message); clients must navigate instead of calling complete. */
	| { turnCount: number; pending: false; sessionCompleted: true; completionReason: "max_turns" };

type SessionMessageMetadata = {
	clientMessageId?: string;
	failed?: boolean;
	failureError?: string | null;
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
	sessionId: number,
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
			.select({ id: practiceSession.id })
			.from(practiceSession)
			.where(and(eq(practiceSession.id, sessionId), eq(practiceSession.userId, userId)))
			.for("update");
		if (!locked) throw new Error("Session not found");
		const session = await tx.query.practiceSession.findFirst({
			where: and(eq(practiceSession.id, sessionId), eq(practiceSession.userId, userId)),
			with: {
				messages: { orderBy: sessionMessageChronologicalOrder },
				task: true,
			},
		});
		if (!session) throw new Error("Session not found");
		if (session.status !== "in_progress") throw new Error("Session not in progress");
		const asyncSurface = isAsyncSurface(session.task.ui);

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
					revivedMetadata = { ...existingMetadata, failed: false, failureError: null, attempt: (existingMetadata.attempt ?? 0) + 1, arrival: true };
					isRetry = true;
				} else {
					revivedMetadata = { ...existingMetadata, failed: false, failureError: null };
				}
				await tx.update(sessionMessage).set({ llmMetadata: revivedMetadata }).where(eq(sessionMessage.id, existing.id));
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
				.insert(sessionMessage)
				.values({
					sessionId,
					role: "user",
					content: trimmedUserMessage,
					llmMetadata: insertedMetadata,
				})
				.returning({ id: sessionMessage.id });
			inputMessageId = inserted[0]?.id ?? null;
			if (!inputMessageId) throw new Error("Failed to persist message");
		}

		const turnCount = countVisibleUserTurns(session.messages) + (revivedMessageId !== null ? 0 : 1);
		const maxTurns = session.task.maxTurns;
		if (maxTurns && turnCount >= maxTurns) {
			await tx
				.update(practiceSession)
				.set({ status: "completed", completionReason: "max_turns", completedAt: now })
				.where(eq(practiceSession.id, sessionId));
			const activeBatches = await tx.query.agentResponseBatch.findMany({
				where: and(
					eq(agentResponseBatch.sessionId, sessionId),
					inArray(agentResponseBatch.status, ["pending", "processing", "stale", "delivery_pending"]),
				),
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
								await tx.query.agentResponseBatch.findMany({
									where: inArray(agentResponseBatch.id, assistantBatchIds),
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
					.update(agentResponseBatch)
					.set({ status: "cancelled", completedAt: now })
					.where(
						and(
							eq(agentResponseBatch.sessionId, sessionId),
							eq(agentResponseBatch.kind, "world"),
							inArray(agentResponseBatch.status, ["pending", "stale", "delivery_pending"]),
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
				.update(agentResponseBatch)
				.set({ status: "cancelled", completedAt: now })
				.where(
					and(
						eq(agentResponseBatch.sessionId, sessionId),
						inArray(agentResponseBatch.status, spareUnclaimed && hasPending ? ["stale"] : ["pending", "stale"]),
						...(asyncSurface ? [ne(agentResponseBatch.kind, "world")] : []),
					),
				)
				.returning({ id: agentResponseBatch.id });
			// Replies the agent already composed (delivery_pending) or is still composing
			// (processing, held by a worker's claim fence) are left alive on purpose: the
			// turn limit ends the session, but the in-flight reply is still delivered
			// into it. Orphaned processing batches are cancelled later via lease reclaim.
			if (spareUnclaimed && !hasPending) {
				const farewellMetadata = getMessageMetadata(
					session.messages.find((message) => message.id === inputMessageId)?.llmMetadata ?? revivedMetadata ?? insertedMetadata ?? {},
				);
				await tx.insert(agentResponseBatch).values({
					sessionId,
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
			const learner = await tx.query.user.findFirst({ where: eq(authUser.id, userId), columns: { name: true } });
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
			await scheduleArrivalTakeUp(tx, { session, learnerName: learner?.name || "Learner", message: inputMessage, isRetry, now });
			return { turnCount, pending: true };
		}

		const dueAt = new Date(now.getTime() + sampleReplyDelayMs(session.task.urgency ?? "high"));
		const activeBatch = await tx.query.agentResponseBatch.findFirst({
			where: and(
				eq(agentResponseBatch.sessionId, sessionId),
				inArray(agentResponseBatch.status, ["pending", "processing", "stale", "delivery_pending"]),
			),
		});
		if (activeBatch?.status === "delivery_pending") {
			// The agent had already composed a reply when the new message landed: it is
			// engaged, so re-engage quickly instead of restarting the full MTTH clock.
			const reEngageAt = new Date(now.getTime() + RE_ENGAGE_DELAY_MS);
			// The batch is cancelled before its deliveries so lock acquisition keeps
			// the session -> batch -> delivery order the delivery worker uses.
			await tx.update(agentResponseBatch).set({ status: "cancelled", completedAt: now }).where(eq(agentResponseBatch.id, activeBatch.id));
			await tx
				.update(agentDelivery)
				.set({ status: "cancelled" })
				.where(and(eq(agentDelivery.batchId, activeBatch.id), eq(agentDelivery.status, "pending")));
			await tx.insert(agentResponseBatch).values({
				sessionId,
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
			await tx.update(agentResponseBatch).set({ status: "cancelled", completedAt: now }).where(eq(agentResponseBatch.id, activeBatch.id));
			await tx.insert(agentResponseBatch).values({
				sessionId,
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
				.update(agentResponseBatch)
				.set({
					...(activeBatch.status === "processing" ? {} : { status: "pending" as const }),
					inputMessageId,
					inputVersion: activeBatch.inputVersion + 1,
				})
				.where(eq(agentResponseBatch.id, activeBatch.id));
		} else {
			await tx.insert(agentResponseBatch).values({
				sessionId,
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

export async function completeSession(sessionId: number): Promise<void> {
	const now = new Date();
	await db.transaction(async (tx) => {
		// The status check and the write must share one locked view of the row: the
		// turn limit (submitMessage), the expiry sweep, and abuse termination all end
		// sessions concurrently. Reading outside the transaction let this overwrite
		// their outcome — relabelling a max_turns completion the worker reads to spare
		// its final reply, or resurrecting an already-abandoned session as completed.
		// Lock order is session -> batch -> delivery, matching submitMessage.
		const [locked] = await tx
			.select({ id: practiceSession.id, status: practiceSession.status })
			.from(practiceSession)
			.where(eq(practiceSession.id, sessionId))
			.for("update");
		if (!locked) throw new Error("Session not found");
		if (locked.status !== "in_progress") throw new Error("Session not in progress");

		const cancellable = await tx.query.agentResponseBatch.findMany({
			where: and(
				eq(agentResponseBatch.sessionId, sessionId),
				inArray(agentResponseBatch.status, ["pending", "processing", "stale", "delivery_pending"]),
			),
			columns: { id: true },
		});
		await tx
			.update(practiceSession)
			.set({ status: "completed", completionReason: "user_requested", completedAt: now })
			.where(eq(practiceSession.id, sessionId));
		await tx
			.update(agentResponseBatch)
			.set({ status: "cancelled", completedAt: now })
			.where(
				and(eq(agentResponseBatch.sessionId, sessionId), inArray(agentResponseBatch.status, ["pending", "processing", "stale", "delivery_pending"])),
			);
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

export async function getSessionOrFail(sessionId: number, userId: string, taskId: number) {
	const session = await db.query.practiceSession.findFirst({
		where: eq(practiceSession.id, sessionId),
	});
	if (!session || session.userId !== userId || session.taskId !== taskId) {
		return null;
	}
	return session;
}
