import type { TraceError } from "$lib/llm/lab";
import {
	type ChatMessage,
	type ChatOptions,
	type ChatResponse,
	chatJson,
	chatText,
	type JsonChatResponse,
	type LlmProviderRoute,
	type LlmRouteInfo,
	type StructuredOutputErrorDetails,
} from "./client";
import { type AnyLlmRecipe, buildRecipeMessages, type LlmRecipe, recipeOptions } from "./recipe";

/** Domain rows a call belongs to, so traces can be found from the page that caused them. */
export type LlmSubjects = {
	taskId?: number;
	sessionId?: number;
	translationAttemptId?: number;
};

export type LlmCallOrigin = "app" | "override" | "lab";

/** A deviation from the recipe's defaults: used by Lab runs and staff overrides. */
export type LlmVariant = {
	slots?: Readonly<Record<string, string>>;
	provider?: LlmProviderRoute;
	options?: ChatOptions;
	/** Replaces the built messages entirely (one-off Playground edits). */
	messages?: ChatMessage[];
};

export type LlmCallContext = {
	userId?: string;
	subjects?: LlmSubjects;
};

export type LlmRecipeResponse<O> = ChatResponse & {
	value: O;
	/** Exact request messages of the successful completion (including a repair turn). */
	requestMessages: ChatMessage[];
	repair: JsonChatResponse<unknown>["repair"];
};

export type LlmCallAttempt = {
	stage: "initial" | "repair";
	requestMessages: ChatMessage[];
	content: string | null;
	finishReason: string | null;
	usage?: unknown;
	errors: string[];
};

/** Everything known about one finished recipe call, handed to the interceptor for capture. */
export type LlmCallRecord = {
	recipe: AnyLlmRecipe;
	origin: LlmCallOrigin;
	userId?: string;
	subjects?: LlmSubjects;
	input: unknown;
	variant: LlmVariant | null;
	/** Id of the staff override that supplied the variant, when origin is `override`. */
	overrideId?: number;
	messages: ChatMessage[];
	options: ChatOptions;
	attempts: LlmCallAttempt[];
	response: ChatResponse | null;
	value: unknown;
	error: unknown;
	latencyMs: number;
	route?: LlmRouteInfo;
	/** Where a failed call stopped; unset on success. */
	errorStage?: TraceError["stage"];
};

export type LlmCallPlan = {
	capture: boolean;
	override?: { id: number; variant: LlmVariant };
};

/**
 * Tracing and staff overrides plug in here, installed once at server boot. Without an interceptor
 * (unit tests, `LLM_LAB=off`) recipes run exactly as declared. Interceptor failures never reach
 * the caller.
 */
export type LlmCallInterceptor = {
	prepare(call: { recipe: AnyLlmRecipe; userId?: string }): Promise<LlmCallPlan>;
	record(record: LlmCallRecord): void | Promise<void>;
};

let interceptor: LlmCallInterceptor | null = null;

export function setLlmCallInterceptor(next: LlmCallInterceptor | null): void {
	interceptor = next;
}

async function planCall(recipe: AnyLlmRecipe, userId?: string): Promise<LlmCallPlan> {
	if (!interceptor) return { capture: false };
	try {
		return await interceptor.prepare({ recipe, userId });
	} catch (error) {
		console.warn(`[llm] Could not prepare ${recipe.id} call; running without tracing or overrides.`, error);
		return { capture: false };
	}
}

function recordCall(record: LlmCallRecord): void {
	if (!interceptor) return;
	try {
		void Promise.resolve(interceptor.record(record)).catch((error) => console.warn(`[llm] Could not record ${record.recipe.id} call.`, error));
	} catch (error) {
		console.warn(`[llm] Could not record ${record.recipe.id} call.`, error);
	}
}

function attemptsFromResponse(messages: ChatMessage[], response: LlmRecipeResponse<unknown>): LlmCallAttempt[] {
	const final: LlmCallAttempt = {
		stage: response.repair ? "repair" : "initial",
		requestMessages: response.requestMessages,
		content: response.content,
		finishReason: response.finishReason,
		usage: response.usage,
		errors: [],
	};
	if (!response.repair) return [final];
	return [
		{ stage: "initial", requestMessages: messages, content: response.repair.initialContent, finishReason: null, errors: response.repair.errors },
		final,
	];
}

function attemptsFromError(messages: ChatMessage[], error: unknown): LlmCallAttempt[] {
	const details = (error as { details?: StructuredOutputErrorDetails } | null)?.details;
	if (!details) return [];
	const attempts: LlmCallAttempt[] = [
		{
			stage: "initial",
			requestMessages: details.requestMessages ?? messages,
			content: details.initialContent,
			finishReason: details.finishReason,
			usage: details.usage,
			errors: details.repair ? details.errors.filter((message) => !details.repair?.errors.includes(message)) : details.errors,
		},
	];
	if (details.repair) {
		attempts.push({
			stage: "repair",
			requestMessages: details.repair.requestMessages,
			content: details.repair.content,
			finishReason: details.repair.finishReason,
			usage: details.repair.usage,
			errors: details.repair.errors,
		});
	}
	return attempts;
}

/** The transport response; text recipes are parsed afterwards so a parser failure keeps the response. */
async function complete<I, P>(
	recipe: LlmRecipe<I, P, unknown>,
	messages: ChatMessage[],
	options: ChatOptions,
	userId: string | undefined,
	provider: LlmProviderRoute | undefined,
): Promise<LlmRecipeResponse<P | null>> {
	if (recipe.output.kind === "json") {
		return chatJson({ schema: recipe.output.schema, messages, options, userId, provider });
	}
	const response = await chatText({ messages, options, userId, provider });
	return { ...response, value: null, requestMessages: messages, repair: null };
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/**
 * Runs a recipe with an explicit origin and variant, bypassing the interceptor's plan. Used by
 * the product runner below and by LLM Lab, which decides variants itself.
 */
export async function executeLlmRecipe<I, P, O>(
	recipe: LlmRecipe<I, P, O>,
	input: I,
	call: LlmCallContext & {
		origin: LlmCallOrigin;
		variant?: LlmVariant | null;
		overrideId?: number;
		capture: boolean;
		/** Receives the record instead of the interceptor (Lab runs store it themselves). */
		recorder?: (record: LlmCallRecord) => void;
	},
): Promise<LlmRecipeResponse<O>> {
	const variant = call.variant ?? null;
	const startedAt = performance.now();
	let messages: ChatMessage[] = [];
	let options: ChatOptions = {};
	let response: LlmRecipeResponse<P | null> | null = null;
	const record = (fields: Pick<LlmCallRecord, "value" | "error" | "attempts" | "errorStage">) => {
		if (!call.capture) return;
		(call.recorder ?? recordCall)({
			recipe,
			origin: call.origin,
			userId: call.userId,
			subjects: call.subjects,
			input,
			variant,
			overrideId: call.overrideId,
			messages,
			options,
			response,
			latencyMs: Math.round(performance.now() - startedAt),
			route: response?.route,
			...fields,
		});
	};

	try {
		messages = variant?.messages ?? buildRecipeMessages(recipe, input, variant?.slots);
		options = { ...recipeOptions(recipe, input), ...variant?.options };
	} catch (error) {
		record({ value: null, error, attempts: [], errorStage: "build" });
		throw error;
	}
	try {
		response = await complete(recipe, messages, options, call.userId, variant?.provider);
	} catch (error) {
		const attempts = attemptsFromError(messages, error);
		record({ value: null, error, attempts, errorStage: attempts.length ? "parse" : "provider" });
		throw error;
	}

	const attempts = attemptsFromResponse(messages, response);
	let parsed: P;
	if (recipe.output.kind === "text") {
		try {
			parsed = recipe.output.parse(response.content);
		} catch (error) {
			const failed = attempts.map((attempt, index) => (index === attempts.length - 1 ? { ...attempt, errors: [errorMessage(error)] } : attempt));
			record({ value: null, error, attempts: failed, errorStage: "parse" });
			throw error;
		}
	} else {
		parsed = response.value as P;
	}
	let value: O;
	try {
		value = recipe.finalize ? recipe.finalize(parsed, input) : (parsed as unknown as O);
	} catch (error) {
		record({ value: parsed, error, attempts, errorStage: "finalize" });
		throw error;
	}
	record({ value, error: null, attempts });
	return { ...response, value };
}

/**
 * The product entry point for every LLM call. Applies the caller's staff override and captures
 * the call when the interceptor's policy says so; otherwise runs the recipe as declared.
 */
export async function runLlmRecipe<I, P, O>(recipe: LlmRecipe<I, P, O>, input: I, context: LlmCallContext = {}): Promise<LlmRecipeResponse<O>> {
	const plan = await planCall(recipe, context.userId);
	return executeLlmRecipe(recipe, input, {
		...context,
		origin: plan.override ? "override" : "app",
		variant: plan.override?.variant,
		overrideId: plan.override?.id,
		capture: plan.capture,
	});
}
