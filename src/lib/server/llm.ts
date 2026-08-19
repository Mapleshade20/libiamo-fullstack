import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import OpenAI from "openai";
import type {
	ChatCompletion,
	ChatCompletionCreateParamsNonStreaming,
	ChatCompletionMessageParam,
	ChatCompletionTool,
	ChatCompletionToolChoiceOption,
} from "openai/resources/chat/completions";
import type { z } from "zod";
import { env } from "$env/dynamic/private";
import { db } from "./db";
import { userApiKey } from "./db/schema";
import { assertTrialQuotaAvailable, debitTrialQuota, TrialQuotaExhaustedError, type TrialQuotaStatus } from "./trial-quota";

// ── Public types ──────────────────────────────────────────────────────

/** Thrown when the API key is invalid, expired, or unauthorized (401/403). */
export class OpenAIAuthError extends Error {
	constructor(
		message = "Invalid API key. Please configure a valid API key in your profile settings.",
		public readonly status: number,
	) {
		super(message);
		this.name = "OpenAIAuthError";
	}
}

/** Expected provider-side failures that are safe to show to learners. */
class LlmProviderError extends Error {
	constructor(
		message: string,
		public readonly status = 500,
	) {
		super(message);
		this.name = "LlmProviderError";
	}
}

export function llmErrorStatus(error: unknown): number {
	if (error instanceof TrialQuotaExhaustedError) return 402;
	if (error instanceof OpenAIAuthError || error instanceof LlmProviderError) return error.status;
	return 500;
}

export function llmErrorMessage(error: unknown): string {
	return error instanceof Error && error.message.trim() ? error.message : "The AI request failed. Please try again.";
}

export type ChatMessage = {
	role: "system" | "user" | "assistant";
	content: string;
};

export type ChatOptions = {
	temperature?: number;
	maxTokens?: number;
};

export type ChatResponse = {
	id?: string;
	model?: string;
	content: string;
	finishReason: string | null;
	usage?: ChatUsage;
	raw: unknown;
	quota?: TrialQuotaStatus;
};

export type ChatUsage = {
	promptTokens?: number;
	completionTokens?: number;
	totalTokens?: number;
};

export type ChatRequest = {
	messages: ChatMessage[];
	options?: ChatOptions;
	userId?: string;
};

export type JsonChatRequest<T extends z.ZodType> = ChatRequest & {
	schema: T;
};

export type JsonChatResponse<T> = ChatResponse & {
	value: T;
	/** Exact request messages used by the successful completion. */
	requestMessages: ChatMessage[];
	/** Present when the first completion failed schema validation and a targeted repair succeeded. */
	repair: null | {
		initialContent: string;
		initialRaw: unknown;
		errors: string[];
	};
};

export type ChatTool = ChatCompletionTool;

export type ChatToolCall = {
	id: string;
	name: string;
	argumentsText: string;
	arguments: unknown;
	raw: unknown;
};

export type ToolChatResponse = ChatResponse & {
	toolCalls: ChatToolCall[];
};

export type ToolChatRequest = ChatRequest & {
	tools: ChatTool[];
	options?: ChatOptions & {
		toolChoice?: ChatCompletionToolChoiceOption;
	};
};

// ── API key encryption and verification ──────────────────────────────

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;

function deriveKey(): Buffer {
	const secret = env.BETTER_AUTH_SECRET;
	if (!secret) throw new Error("BETTER_AUTH_SECRET is not set");
	return crypto.scryptSync(secret, "libiamo-api-key-salt", 32);
}

export function encryptApiKey(plaintext: string): string {
	const key = deriveKey();
	const iv = crypto.randomBytes(IV_LENGTH);
	const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

	let encrypted = cipher.update(plaintext, "utf8", "hex");
	encrypted += cipher.final("hex");
	const authTag = cipher.getAuthTag();

	// Format: iv:authTag:ciphertext (all hex)
	return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

export function decryptApiKey(ciphertext: string): string {
	const key = deriveKey();
	const parts = ciphertext.split(":");

	if (parts.length !== 3) {
		throw new Error("Invalid encrypted API key format");
	}

	const iv = Buffer.from(parts[0], "hex");
	const authTag = Buffer.from(parts[1], "hex");
	const encrypted = parts[2];

	const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
	decipher.setAuthTag(authTag);

	let decrypted = decipher.update(encrypted, "hex", "utf8");
	decrypted += decipher.final("utf8");

	return decrypted;
}

// ── Verification ────────────────────────────────────────────────────

const VERIFY_TIMEOUT_MS = 8000;

export async function verifyApiKey(baseUrl: string, apiKey: string, model: string): Promise<{ ok: true } | { ok: false; error: string }> {
	const normalizedBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
	const endpoint = `${normalizedBase}/chat/completions`;

	let response: Response;
	try {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);

		try {
			response = await fetch(endpoint, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${apiKey}`,
				},
				body: JSON.stringify({
					model,
					messages: [{ role: "user", content: "Hi" }],
					max_tokens: 1,
				}),
				signal: controller.signal,
			});
		} finally {
			clearTimeout(timeout);
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (message.includes("abort") || message.includes("AbortError") || message.includes("timeout")) {
			return { ok: false, error: "Request timed out. Check the Base URL." };
		}
		return { ok: false, error: `Network error: ${message}` };
	}

	if (response.ok) {
		return { ok: true };
	}

	let detail = `HTTP ${response.status}`;
	try {
		const body = await response.text();
		const parsed = JSON.parse(body);
		const errorVal = (parsed as Record<string, unknown>).error;
		const msg =
			errorVal && typeof errorVal === "object" && errorVal !== null
				? (errorVal as Record<string, unknown>).message || JSON.stringify(errorVal)
				: body.slice(0, 200);
		detail = `HTTP ${response.status}: ${msg}`;
	} catch {
		// Use default detail
	}

	return { ok: false, error: detail };
}

// ── Config resolution ─────────────────────────────────────────────────

type OpenAIConfigSource = "byok" | "env";

type OpenAIConfig = {
	apiKey: string;
	baseUrl: string;
	model: string;
};

type ResolvedOpenAIConfig = OpenAIConfig & {
	source: OpenAIConfigSource;
};

function getEnvOpenAIConfig(): OpenAIConfig {
	const apiKey = env.OPENAI_API_KEY?.trim();
	if (!apiKey) {
		throw new LlmProviderError("The shared AI service is not configured. Add your own API key in Profile to keep using AI features.", 503);
	}

	const baseUrlRaw = env.OPENAI_BASE_URL?.trim();
	if (!baseUrlRaw) {
		throw new LlmProviderError("The shared AI service is not configured. Add your own API key in Profile to keep using AI features.", 503);
	}

	const model = env.OPENAI_MODEL?.trim();
	if (!model) {
		throw new LlmProviderError("The shared AI service is not configured. Add your own API key in Profile to keep using AI features.", 503);
	}

	return { apiKey, baseUrl: trimTrailingSlash(baseUrlRaw), model };
}

async function getUserOpenAIConfig(userId: string): Promise<OpenAIConfig | null> {
	const row = await db.query.userApiKey.findFirst({
		where: eq(userApiKey.userId, userId),
	});

	if (!row) return null;

	return {
		apiKey: decryptApiKey(row.encryptedKey),
		baseUrl: trimTrailingSlash(row.baseUrl),
		model: row.model,
	};
}

async function resolveOpenAIConfig(userId?: string): Promise<ResolvedOpenAIConfig> {
	if (userId) {
		const userConfig = await getUserOpenAIConfig(userId);
		if (userConfig) {
			const resolved = { ...userConfig, source: "byok" as const };
			debugLog("config", { source: resolved.source, model: resolved.model, baseUrl: resolved.baseUrl });
			return resolved;
		}
	}

	const envConfig = getEnvOpenAIConfig();
	const resolved = { ...envConfig, source: "env" as const };
	debugLog("config", { source: resolved.source, model: resolved.model, baseUrl: resolved.baseUrl });
	return resolved;
}

function trimTrailingSlash(value: string) {
	return value.endsWith("/") ? value.slice(0, -1) : value;
}

function createOpenAIClient(config: OpenAIConfig) {
	return new OpenAI({
		apiKey: config.apiKey,
		baseURL: config.baseUrl,
		maxRetries: 0,
	});
}

// ── Debug helpers ─────────────────────────────────────────────────────

function isLlmDebugEnabled() {
	const value = env.LLM_DEBUG?.trim().toLowerCase();
	return value === "1" || value === "true" || value === "yes" || value === "on";
}

function debugLog(event: string, details: Record<string, unknown>) {
	if (!isLlmDebugEnabled()) return;

	try {
		console.info(`[llm-debug] ${event}`, JSON.stringify(details, null, 2));
	} catch {
		console.info(`[llm-debug] ${event}`, details);
	}
}

// ── Message helpers ───────────────────────────────────────────────────

function validateMessages(messages: ChatMessage[]) {
	if (!Array.isArray(messages) || messages.length === 0) {
		throw new Error("messages must contain at least one item");
	}

	for (const message of messages) {
		if (!message || !["system", "user", "assistant"].includes(message.role)) {
			throw new Error("each message.role must be one of: system, user, assistant");
		}

		if (typeof message.content !== "string" || !message.content.trim()) {
			throw new Error("each message.content must be a non-empty string");
		}
	}
}

function toOpenAIMessages(messages: ChatMessage[]): ChatCompletionMessageParam[] {
	return messages.map((message) => ({ ...message })) as ChatCompletionMessageParam[];
}

// ── JSON helpers ──────────────────────────────────────────────────────

function stripJsonFences(text: string) {
	let cleaned = text.trim();
	cleaned = cleaned.replace(/^`{3}(?:json)?/i, "").trim();
	cleaned = cleaned.replace(/`{3}$/i, "").trim();
	return cleaned;
}

function extractContentFromFence(text: string): string {
	const trimmed = text.trim();
	const fenceStart = trimmed.indexOf("```");
	if (fenceStart !== -1) {
		let after = trimmed.slice(fenceStart + 3);
		if (after.toLowerCase().startsWith("json")) after = after.slice(4);
		after = after.trimStart();
		const fenceEnd = after.indexOf("```");
		if (fenceEnd !== -1) return after.slice(0, fenceEnd).trim();
	}
	return trimmed;
}

function extractJsonValue(text: string) {
	const stripped = stripJsonFences(extractContentFromFence(text));
	const objectStart = stripped.indexOf("{");
	const arrayStart = stripped.indexOf("[");
	const starts = [objectStart, arrayStart].filter((index) => index >= 0);
	const start = starts.length ? Math.min(...starts) : -1;

	if (start === -1) return stripped;

	const endChar = stripped[start] === "{" ? "}" : "]";
	const end = stripped.lastIndexOf(endChar);
	if (end === -1 || end <= start) return stripped;

	return stripped.slice(start, end + 1);
}

function repairMalformedJson(text: string) {
	return extractJsonValue(text).replace(/"\s+([A-Za-z_$][\w$-]*)"\s*:/g, '"$1":');
}

type StructuredParseResult<T> = { success: true; value: T } | { success: false; errors: string[] };

function formatZodIssue(issue: z.core.$ZodIssue): string {
	const path = issue.path.length > 0 ? issue.path.map(String).join(".") : "root";
	return `${path}: ${issue.message}`;
}

function parseStructuredOutputText<T extends z.ZodType>(schema: T, text: string): StructuredParseResult<z.infer<T>> {
	const candidates = [...new Set([extractJsonValue(text), repairMalformedJson(text)])];
	const errors = new Set<string>();

	for (const candidate of candidates) {
		let parsed: unknown;
		try {
			parsed = JSON.parse(candidate);
		} catch (error) {
			errors.add(`Invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
			continue;
		}

		const result = schema.safeParse(parsed);
		if (result.success) return { success: true, value: result.data as z.infer<T> };
		for (const issue of result.error.issues) errors.add(formatZodIssue(issue));
	}

	return { success: false, errors: [...errors] };
}

export interface StructuredOutputErrorDetails {
	initialContent: string | null;
	initialRaw: unknown;
	errors: string[];
	finishReason: string | null;
	usage?: unknown;
	id?: string;
	model?: string;
}

function structuredOutputError(details?: StructuredOutputErrorDetails): LlmProviderError {
	const error = new LlmProviderError("The AI response was not in the expected format. Please try again.", 502);
	if (details) (error as LlmProviderError & { details?: StructuredOutputErrorDetails }).details = details;
	return error;
}

function buildRepairMessages(messages: ChatMessage[], rawContent: string, errors: string[]): ChatMessage[] {
	return [
		...messages,
		{ role: "assistant", content: rawContent },
		{
			role: "user",
			content: `Your previous response was invalid. Return the COMPLETE corrected JSON value only, with no Markdown fences or explanation, matching the JSON shape described in the system prompt.\n\nValidation errors:\n${errors.map((error) => `- ${error}`).join("\n")}`,
		},
	];
}

// ── OpenAI call ───────────────────────────────────────────────────────

type CompletionOptions = ChatOptions & {
	tools?: ChatTool[];
	toolChoice?: ChatCompletionToolChoiceOption;
};

type ChatCompletionResult = {
	completion: ChatCompletion;
	quota?: TrialQuotaStatus;
};

async function callChatCompletion(messages: ChatMessage[], options: CompletionOptions = {}, userId?: string): Promise<ChatCompletionResult> {
	validateMessages(messages);

	const config = await resolveOpenAIConfig(userId);
	const shouldApplyTrialQuota = Boolean(userId && config.source === "env");
	if (userId && shouldApplyTrialQuota) {
		await assertTrialQuotaAvailable(userId);
	}
	const url = `${config.baseUrl}/chat/completions`;
	const request: ChatCompletionCreateParamsNonStreaming = {
		model: config.model,
		messages: toOpenAIMessages(messages),
		max_tokens: options.maxTokens ?? 8192,
		...(options.temperature === undefined ? {} : { temperature: options.temperature }),
		...(options.tools ? { tools: options.tools, tool_choice: options.toolChoice ?? "auto", parallel_tool_calls: false } : {}),
	};

	debugLog("request", { url, body: request });

	let completion: ChatCompletion;
	let response: Response;

	try {
		const result = await createOpenAIClient(config).chat.completions.create(request).withResponse();
		completion = result.data;
		response = result.response;
	} catch (error) {
		throw normalizeOpenAIError(error);
	}

	const responseError = (completion as unknown as { error?: { message?: string } }).error;
	if (responseError) {
		throw new LlmProviderError(responseError.message ?? "The AI provider returned an error. Please try again.", 502);
	}

	debugLog("response", { url, status: response.status, body: completion });

	const quota = userId && shouldApplyTrialQuota ? await debitTrialQuota(userId, ...extractVisibleOutputTokenUsage(completion)) : undefined;

	return { completion, quota };
}

function extractVisibleOutputTokenUsage(completion: ChatCompletion): [tokens: number, estimated: boolean] {
	const usage = completion.usage as
		| {
				completion_tokens?: unknown;
				completion_tokens_details?: { reasoning_tokens?: unknown };
		  }
		| null
		| undefined;

	if (typeof usage?.completion_tokens === "number" && Number.isFinite(usage.completion_tokens)) {
		const reasoningTokens =
			typeof usage.completion_tokens_details?.reasoning_tokens === "number" && Number.isFinite(usage.completion_tokens_details.reasoning_tokens)
				? usage.completion_tokens_details.reasoning_tokens
				: 0;
		return [Math.max(0, usage.completion_tokens - reasoningTokens), false];
	}

	const text = completionOutputTextForEstimate(completion);
	return [text.trim() ? Math.max(1, Math.ceil(text.length / 4)) : 0, true];
}

function completionOutputTextForEstimate(completion: ChatCompletion): string {
	const message = completion.choices[0]?.message;
	const parts = [message?.content ?? ""];
	for (const toolCall of message?.tool_calls ?? []) {
		if (toolCall.type === "function") {
			parts.push(toolCall.function.arguments);
		}
	}
	return parts.join("\n");
}

function completionContent(completion: ChatCompletion) {
	return completion.choices[0]?.message.content?.trim() ?? "";
}

function completionResponse(completion: ChatCompletion): ChatResponse {
	return {
		id: completion.id,
		model: completion.model,
		content: completionContent(completion),
		finishReason: completion.choices[0]?.finish_reason ?? null,
		usage: completionUsage(completion),
		raw: completion,
	};
}

function completionUsage(completion: ChatCompletion): ChatUsage | undefined {
	if (!completion.usage) return undefined;
	return {
		promptTokens: completion.usage.prompt_tokens,
		completionTokens: completion.usage.completion_tokens,
		totalTokens: completion.usage.total_tokens,
	};
}

function parseToolArguments(args: string) {
	try {
		return JSON.parse(args) as unknown;
	} catch {
		return args;
	}
}

function completionToolCalls(completion: ChatCompletion): ChatToolCall[] {
	return (completion.choices[0]?.message.tool_calls ?? [])
		.filter((toolCall) => toolCall.type === "function")
		.map((toolCall) => ({
			id: toolCall.id,
			name: toolCall.function.name,
			argumentsText: toolCall.function.arguments,
			arguments: parseToolArguments(toolCall.function.arguments),
			raw: toolCall,
		}));
}

function normalizeOpenAIError(error: unknown): Error {
	if (error instanceof OpenAI.APIConnectionError) {
		return new LlmProviderError("Could not connect to the AI provider. Please try again.", 503);
	}

	if (error instanceof OpenAI.APIError && typeof error.status === "number") {
		if (error.status === 401 || error.status === 403) {
			return new OpenAIAuthError(undefined, error.status);
		}
		if (error.status === 429) {
			return new LlmProviderError("The AI provider is rate-limiting requests. Please try again shortly.", 429);
		}
		if (error.status >= 500) {
			return new LlmProviderError("The AI provider is temporarily unavailable. Please try again shortly.", 502);
		}
		return new LlmProviderError(error.message || "The AI provider returned an error. Please try again.", 502);
	}

	return error instanceof Error ? error : new Error(String(error));
}

// ── Public facade ─────────────────────────────────────────────────────

export async function chatText({ messages, options = {}, userId }: ChatRequest): Promise<ChatResponse> {
	const result = await callChatCompletion(messages, options, userId);
	const response = completionResponse(result.completion);
	if (!response.content) {
		throw new LlmProviderError("The AI provider returned an empty response. Please try again.", 502);
	}
	return { ...response, quota: result.quota };
}

export async function chatJson<T extends z.ZodType>({
	schema,
	messages,
	options = {},
	userId,
}: JsonChatRequest<T>): Promise<JsonChatResponse<z.infer<T>>> {
	const first = await chatText({ messages, options, userId });
	if (first.finishReason === "length")
		throw structuredOutputError({
			initialContent: first.content,
			initialRaw: first.raw,
			errors: ["Response was truncated (finish_reason: length)"],
			finishReason: first.finishReason,
			usage: first.usage,
			id: first.id,
			model: first.model,
		});

	const firstParse = parseStructuredOutputText(schema, first.content);
	if (firstParse.success) return { ...first, value: firstParse.value, requestMessages: messages, repair: null };

	const failureDetails = {
		initialContent: first.content,
		initialRaw: first.raw,
		errors: firstParse.errors,
		finishReason: first.finishReason,
		usage: first.usage,
		id: first.id,
		model: first.model,
	};
	const repairMessages = buildRepairMessages(messages, first.content, firstParse.errors);
	const repaired = await chatText({ messages: repairMessages, options, userId });
	if (repaired.finishReason === "length") throw structuredOutputError(failureDetails);

	const repairedParse = parseStructuredOutputText(schema, repaired.content);
	if (!repairedParse.success) throw structuredOutputError({ ...failureDetails, errors: [...failureDetails.errors, ...repairedParse.errors] });
	return {
		...repaired,
		value: repairedParse.value,
		requestMessages: repairMessages,
		repair: { initialContent: first.content, initialRaw: first.raw, errors: firstParse.errors },
	};
}

export async function chatTools({ messages, tools, options = {}, userId }: ToolChatRequest): Promise<ToolChatResponse> {
	if (!Array.isArray(tools) || tools.length === 0) {
		throw new Error("tools must contain at least one item");
	}

	const result = await callChatCompletion(messages, { ...options, tools, toolChoice: options.toolChoice }, userId);
	const response = completionResponse(result.completion);
	const toolCalls = completionToolCalls(result.completion);

	if (!response.content && toolCalls.length === 0) {
		throw new LlmProviderError("The AI provider returned an empty response. Please try again.", 502);
	}

	return {
		...response,
		quota: result.quota,
		toolCalls,
	};
}
