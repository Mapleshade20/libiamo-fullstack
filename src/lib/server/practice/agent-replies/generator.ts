import { z } from "zod";
import type { TaskSource } from "$lib/practice/messages";
import { isLiveChat } from "$lib/practice/scene";
import type { ChatMessage, StructuredOutputErrorDetails } from "$lib/server/llm/client";
import { defineLlmRecipe } from "$lib/server/llm/recipe";
import { executeLlmRecipe, type LlmRecipeResponse, type LlmSubjects, type LlmVariant, runLlmRecipe } from "$lib/server/llm/run";
import {
	AGENT_REPLY_SLOTS,
	type AgentEvent,
	type AgentTaskContext,
	buildAgentMessages,
	buildAgentTranscript,
	isThreadedUi,
	supportsReplyReferences,
} from "$lib/server/practice/agent-replies/prompt";
import { pickChatTaskFacts, type TaskFacts } from "$lib/server/practice/prompt-context";
import { sendsBursts } from "./floor";

/**
 * Models often drop a key whose value is null, or echo a numeric id as a string. Neither is worth
 * a repair round trip, so a missing target reads as null and a numeric string as its number.
 */
const replyTargetSchema = z
	.union([
		z.number().int().positive(),
		z
			.string()
			.regex(/^[1-9]\d*$/)
			.transform(Number),
		z.null(),
	])
	.optional()
	.transform((value) => value ?? null);

const deliverySchema = z.object({
	author: z.string().trim().max(200).default(""),
	replyTo: replyTargetSchema,
	content: z.string().trim().min(1).max(50_000),
});

export const agentResponseDecisionSchema = z
	.object({
		decision: z.enum(["reply", "no_reply", "terminate_abuse"]),
		deliveries: z.array(deliverySchema),
		allowIdleFollowUp: z.boolean(),
		terminationReason: z.string().trim().min(1).max(1_000).nullable(),
	})
	.superRefine((value, ctx) => {
		if (value.decision === "reply" && value.deliveries.length === 0) {
			ctx.addIssue({ code: "custom", path: ["deliveries"], message: "reply requires at least one delivery" });
		}
		if (value.decision === "no_reply" && value.deliveries.length !== 0) {
			ctx.addIssue({ code: "custom", path: ["deliveries"], message: "no_reply cannot contain deliveries" });
		}
		if (value.decision === "terminate_abuse" && value.deliveries.length > 1) {
			ctx.addIssue({ code: "custom", path: ["deliveries"], message: "terminate_abuse allows at most one final delivery" });
		}
		if (value.decision === "terminate_abuse" && !value.terminationReason) {
			ctx.addIssue({ code: "custom", path: ["terminationReason"], message: "terminate_abuse requires a reason" });
		}
		if (value.decision !== "terminate_abuse" && value.terminationReason !== null) {
			ctx.addIssue({ code: "custom", path: ["terminationReason"], message: "terminationReason is reserved for terminate_abuse" });
		}
	});

export type AgentResponseDecision = z.infer<typeof agentResponseDecisionSchema>;

/**
 * A message ready to deliver. `replyTo` is a scene message ref (see `getCommentId`), `@n` for the
 * n-th delivery of the same turn, or null.
 */
export type SceneDelivery = { author: string; replyTo: string | null; content: string };

/** The decision with deliveries resolved against the transcript, plus what had to be coerced. */
export type SceneTurn = Omit<AgentResponseDecision, "deliveries"> & {
	deliveries: SceneDelivery[];
	warnings: string[];
	/** A complete extra email held for a later take-up (mail only); the worker schedules it once the first lands. */
	preservedFollowOn?: PreservedDelivery;
};

/** A complete extra email held for a later take-up (mail only). */
export type PreservedDelivery = { author: string; replyTo: string | null; content: string };

export type AgentHistoryMessage = {
	id: number;
	role: "user" | "assistant";
	content: string;
	llmMetadata?: unknown;
};

export type AgentGenerationArtifacts = {
	requestMessages: ChatMessage[];
	rawResponse: string;
	parsedResult: SceneTurn;
	providerMetadata: {
		id?: string;
		model?: string;
		finishReason: string | null;
		usage?: unknown;
		quota?: unknown;
		raw: unknown;
		repair: null | { initialContent: string; initialRaw: unknown; errors: string[] };
		contractWarnings?: string[];
	};
};

/** Failure evidence available even when generation does not produce a parsed result. */
export type AgentGenerationFailureArtifacts = {
	requestMessages: ChatMessage[];
	rawResponse: string | null;
	providerMetadata: {
		id?: string;
		model?: string;
		finishReason: string | null;
		usage?: unknown;
		raw: unknown;
		validationErrors?: string[];
		failureStage: "provider" | "parse";
		attempts?: Array<{
			stage: "initial" | "repair";
			requestMessages: ChatMessage[];
			content: string | null;
			raw: unknown;
			errors: string[];
			finishReason: string | null;
		}>;
	};
};

export class AgentGenerationError extends Error {
	readonly failureArtifacts: AgentGenerationFailureArtifacts;

	constructor(message: string, failureArtifacts: AgentGenerationFailureArtifacts, options?: { cause?: unknown }) {
		super(message, options);
		this.name = "AgentGenerationError";
		this.failureArtifacts = failureArtifacts;
	}
}

type LiveTask = TaskFacts & { id: number; agentPrompt: string | null; openingState: Record<string, unknown> | null; source?: TaskSource | null };

export type GenerateAgentResponseInput = {
	/** The live task row; the scene is resolved from it for the learner. */
	task: LiveTask;
	/** The learner's display name, as the interface shows it. */
	learnerName: string;
	history: AgentHistoryMessage[];
	event?: AgentEvent;
	/** Seeds the floor draw; the worker passes the batch id. */
	seed?: number;
	/** Whom the learner's unmarked message is for, if inferred (see `server/practice/addressee`). */
	addressees?: string[];
	/** The async opportunity's identity: its fixed participant and the conversation it serves. */
	participant?: string;
	targetRef?: string | null;
	/** A Lab variant (slots, provider, options) to run instead of the recipe as declared. */
	variant?: LlmVariant;
	userId?: string;
	subjects?: LlmSubjects;
};

export type AgentReplyRecipeInput = Omit<GenerateAgentResponseInput, "task" | "userId" | "subjects" | "variant"> & { task: AgentTaskContext };

export function agentTaskContext(task: LiveTask, learnerName: string): AgentTaskContext {
	return { ...pickChatTaskFacts(task, learnerName), agentPrompt: task.agentPrompt, source: task.source ?? null };
}

/**
 * Resolves planned messages against the transcript the model saw: the author becomes a cast member
 * (always the counterpart one-to-one), and a numeric `replyTo` becomes the ref of that entry or
 * `@n` for an earlier message of the same turn. Anything unusable is coerced, with a warning.
 */
function resolveMessages<T extends { author: string; replyTo: number | null }>(
	items: T[],
	input: AgentReplyRecipeInput,
	warnings: string[],
): Array<Omit<T, "replyTo"> & { replyTo: string | null }> {
	const { task, learnerName } = input;
	const { entries, refs } = buildAgentTranscript(input);
	const nextId = refs.length + 1;
	const castNames = new Set(task.scene.cast.map((person) => person.name.toLowerCase()));
	const resolved: Array<{ author: string; replyTo: number | null }> = [];
	const authorOf = (id: number) => (id < nextId ? entries[id - 1]?.author : resolved[id - nextId]?.author);
	const parentOf = (id: number) => (id < nextId ? (entries[id - 1]?.replyTo ?? null) : (resolved[id - nextId]?.replyTo ?? null));
	return items.map((item, index) => {
		let author = item.author.trim();
		const key = author.toLowerCase();
		if (!task.scene.group || !author || key === learnerName.trim().toLowerCase()) {
			if (author !== task.scene.counterpart.name) warnings.push(`Message ${index} author "${author}" became ${task.scene.counterpart.name}`);
			author = task.scene.counterpart.name;
		} else if (!task.scene.open && !castNames.has(key)) {
			warnings.push(`Message ${index} author "${author}" is not in the cast`);
		}
		let target = item.replyTo;
		// Nobody answers themselves: a reply aimed at one's own message goes to the latest answer
		// someone else gave it (the conversation it continues), else up to its parent.
		for (let hops = 0; target !== null && hops < 8 && authorOf(target) === author; hops += 1) {
			warnings.push(`Message ${index} by ${author} answered their own #${target}`);
			const own = target;
			const answers = [
				...entries.filter((entry) => entry.replyTo === own),
				...resolved.map((message, at) => ({ ...message, id: nextId + at })).filter((message) => message.replyTo === own),
			];
			target = answers.findLast((answer) => answer.author !== author)?.id ?? parentOf(own);
		}
		// A chat quote of the message right above says nothing; people quote what scrolled away.
		if (!isThreadedUi(task.ui) && target === nextId + index - 1) target = null;
		let replyTo: string | null = null;
		if (target !== null && supportsReplyReferences(task.ui)) {
			if (target < nextId) replyTo = refs[target - 1];
			else if (target < nextId + index) replyTo = `@${target - nextId}`;
		}
		if (target !== null && replyTo === null) warnings.push(`Message ${index} replyTo ${target} became null`);
		resolved.push({ author, replyTo: target });
		return { ...item, author, replyTo };
	});
}

/** A thought sent as up to three messages: one per line or sentence, the rest folded into the last. */
function splitBurst(text: string): string[] {
	const parts = text
		.split(/\n+|(?<=[.!?…])\s+/)
		.map((part) => part.trim())
		.filter(Boolean);
	return parts.length <= 3 ? parts : [...parts.slice(0, 2), parts.slice(2).join(" ")];
}

/** An email body with its leading header lines dropped, without stripMailHeaders' whole-text fallback. */
function mailBody(content: string): string {
	const lines = content.replace(/\r\n?/g, "\n").split("\n");
	let start = 0;
	while (start < lines.length && (/^(subject|from|to|cc|bcc|date)\s*:/i.test(lines[start].trim()) || lines[start].trim() === "")) start += 1;
	return lines.slice(start).join("\n").trim();
}

/** Whether a body carries a new email's header block after its first line: an anomaly to record, never a split. */
function embedsEmailStructure(content: string): boolean {
	const lines = content.replace(/\r\n?/g, "\n").split("\n");
	let start = 0;
	while (start < lines.length && (/^(subject|from|to|cc|bcc|date)\s*:/i.test(lines[start].trim()) || lines[start].trim() === "")) start += 1;
	return lines.slice(start + 1).some((line) => /^(subject|from|to|cc|bcc|date)\s*:\s*\S/i.test(line));
}

/**
 * Mail, one email per author per take-up: the first complete email is the delivery, one further
 * complete email is preserved for a later take-up, and anything else — further complete emails,
 * or fragments without a substantive body — is dropped with a warning. Bodies are never split:
 * quoted header lines inside a body are the body's own text, recorded as an anomaly when they
 * look like a new email.
 */
function mailTakeUp(deliveries: SceneDelivery[], warnings: string[]): { deliveries: SceneDelivery[]; preservedFollowOn?: PreservedDelivery } {
	const kept: SceneDelivery[] = [];
	const authors = new Set<string>();
	let preservedFollowOn: PreservedDelivery | undefined;
	for (const [index, delivery] of deliveries.entries()) {
		if (!mailBody(delivery.content)) {
			warnings.push(`Delivery ${index} has no substantive email body; dropped`);
			continue;
		}
		const key = delivery.author.trim().toLowerCase();
		if (!authors.has(key)) {
			authors.add(key);
			kept.push(delivery);
			if (embedsEmailStructure(delivery.content)) warnings.push(`Delivery ${index} embeds email structure mid-body; delivered as one email`);
		} else if (!preservedFollowOn) {
			preservedFollowOn = { author: delivery.author, replyTo: delivery.replyTo, content: delivery.content };
		} else {
			warnings.push(`Delivery ${index} is a further complete email beyond the one preserved; dropped`);
		}
	}
	return { deliveries: kept, ...(preservedFollowOn ? { preservedFollowOn } : {}) };
}

/**
 * Same-turn references keep the numbering the model used, but the single-author filter may
 * have removed deliveries between a reference and its target. Map each reference onto the
 * surviving delivery it named; a reference into a dropped delivery follows the conversation
 * that delivery continued (its own target), so a reply never becomes a top-level comment by
 * accident.
 */
function remapSameTurnReferences(
	items: AgentResponseDecision["deliveries"],
	originalItems: AgentResponseDecision["deliveries"],
	survivors: Map<number, number>,
	input: AgentReplyRecipeInput,
	warnings: string[],
): AgentResponseDecision["deliveries"] {
	const nextId = buildAgentTranscript(input).refs.length + 1;
	const targetOf = (original: number): number | null => {
		for (let hops = 0; hops < 8; hops += 1) {
			const survivor = survivors.get(original);
			if (survivor !== undefined) return nextId + survivor;
			const dropped = originalItems[original];
			if (!dropped || dropped.replyTo === null) return null;
			if (dropped.replyTo < nextId) return dropped.replyTo;
			original = dropped.replyTo - nextId;
		}
		return null;
	};
	return items.map((item, index) => {
		if (item.replyTo === null || item.replyTo < nextId || item.replyTo - nextId >= originalItems.length) return item;
		const target = targetOf(item.replyTo - nextId);
		if (target === item.replyTo) return item;
		if (target === null) warnings.push(`Delivery ${index} replyTo named dropped delivery ${item.replyTo - nextId}; became null`);
		return { ...item, replyTo: target };
	});
}

export function resolveSceneTurn(decision: AgentResponseDecision, input: AgentReplyRecipeInput): SceneTurn {
	const warnings: string[] = [];
	let items = decision.deliveries;
	// An async batch is one participant's take-up: words the model put in anyone else's mouth are
	// the persona theft this guards against, dropped with a warning rather than reattributed.
	if (input.participant !== undefined) {
		const expected = input.participant.trim().toLowerCase();
		const survivors = new Map<number, number>();
		items = items.filter((item, index) => {
			if (item.author.trim().toLowerCase() === expected) {
				survivors.set(index, survivors.size);
				return true;
			}
			warnings.push(`Delivery ${index} author "${item.author}" is not the participant ${input.participant}; dropped`);
			return false;
		});
		items = remapSameTurnReferences(items, decision.deliveries, survivors, input, warnings);
	}
	const resolved = resolveMessages(items, input, warnings);
	// People who send bursts post a thought as several messages; `@n` references follow the first piece.
	const { entries } = buildAgentTranscript(input);
	const pieces = resolved.map((delivery) =>
		sendsBursts(input.task.ui, delivery.author, entries) ? splitBurst(delivery.content) : [delivery.content],
	);
	const firstPiece = pieces.map((_, index) => pieces.slice(0, index).reduce((count, piece) => count + piece.length, 0));
	const remap = (replyTo: string | null) => (replyTo?.startsWith("@") ? `@${firstPiece[Number(replyTo.slice(1))]}` : replyTo);
	const deliveries = resolved.flatMap((delivery, index) =>
		pieces[index].map((content, at) => ({ author: delivery.author, replyTo: at ? null : remap(delivery.replyTo), content })),
	);
	// A public channel never winds down for good: someone always posts again.
	const allowIdleFollowUp = decision.allowIdleFollowUp || (input.task.scene.open && isLiveChat(input.task.ui, input.task.scene));
	const mail = input.task.ui === "apple_mail" ? mailTakeUp(deliveries, warnings) : undefined;
	return {
		...decision,
		allowIdleFollowUp,
		deliveries: mail?.deliveries ?? deliveries,
		...(mail?.preservedFollowOn ? { preservedFollowOn: mail.preservedFollowOn } : {}),
		warnings,
	};
}

export const agentReplyRecipe = defineLlmRecipe({
	id: "practice.agent-reply",
	version: 5,
	title: "Scene reply",
	reasoningEffort: "low",
	output: { kind: "json", schema: agentResponseDecisionSchema },
	slots: AGENT_REPLY_SLOTS,
	build: (input: AgentReplyRecipeInput, slot) => buildAgentMessages(input, slot),
	finalize: (decision, input): SceneTurn => resolveSceneTurn(decision, input),
});

export function buildAgentResponseMessages(input: AgentReplyRecipeInput): ChatMessage[] {
	return buildAgentMessages(input);
}

function providerErrorArtifacts(messages: ChatMessage[], error: unknown): AgentGenerationFailureArtifacts {
	const details = (error as { details?: StructuredOutputErrorDetails } | null)?.details;
	const attempts = details
		? [
				{
					stage: "initial" as const,
					requestMessages: details.requestMessages,
					content: details.initialContent,
					raw: details.initialRaw,
					errors: details.errors,
					finishReason: details.finishReason,
				},
				...(details.repair
					? [
							{
								stage: "repair" as const,
								requestMessages: details.repair.requestMessages,
								content: details.repair.content,
								raw: details.repair.raw,
								errors: details.repair.errors,
								finishReason: details.repair.finishReason,
							},
						]
					: []),
			]
		: undefined;
	return {
		requestMessages: details?.repair?.requestMessages ?? details?.requestMessages ?? messages,
		rawResponse: details?.repair?.content ?? details?.initialContent ?? null,
		providerMetadata: {
			id: details?.repair?.id ?? details?.id,
			model: details?.repair?.model ?? details?.model,
			finishReason: details?.repair?.finishReason ?? details?.finishReason ?? null,
			usage: details?.repair?.usage ?? details?.usage,
			raw: details?.repair?.raw ?? details?.initialRaw ?? null,
			validationErrors: details ? [...details.errors, ...(details.repair?.errors ?? [])] : undefined,
			failureStage: details ? "parse" : "provider",
			attempts,
		},
	};
}

export async function generateAgentResponse(input: GenerateAgentResponseInput): Promise<AgentGenerationArtifacts> {
	const { userId, subjects, variant, ...rest } = input;
	const recipeInput: AgentReplyRecipeInput = { ...rest, task: agentTaskContext(input.task, input.learnerName) };
	let response: LlmRecipeResponse<SceneTurn>;
	try {
		response = variant
			? await executeLlmRecipe(agentReplyRecipe, recipeInput, { userId, origin: "lab", variant, capture: false })
			: await runLlmRecipe(agentReplyRecipe, recipeInput, { userId, subjects });
	} catch (error) {
		const messages =
			(error as { details?: StructuredOutputErrorDetails } | null)?.details?.requestMessages ?? buildAgentResponseMessages(recipeInput);
		const message = error instanceof Error && error.message ? error.message : "Agent generation failed";
		throw new AgentGenerationError(message, providerErrorArtifacts(messages, error), { cause: error });
	}
	const { warnings } = response.value;
	return {
		requestMessages: response.requestMessages,
		rawResponse: response.content,
		parsedResult: response.value,
		providerMetadata: {
			id: response.id,
			model: response.model,
			finishReason: response.finishReason,
			usage: response.usage,
			quota: response.quota,
			raw: response.raw,
			repair: response.repair,
			...(warnings.length > 0 ? { contractWarnings: warnings } : {}),
		},
	};
}
