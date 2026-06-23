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
import { userApiKey, userQuota } from "./db/schema";

// ── Public types ──────────────────────────────────────────────────────

/** Thrown when the API key is invalid, expired, or unauthorized (401/403). */
export class OpenAIAuthError extends Error {
	constructor(
		message: string,
		public readonly status: number,
	) {
		super(message);
		this.name = "OpenAIAuthError";
	}
}

/** Thrown when a non-BYOK user has no trial tokens left before an LLM call. */
export class TrialQuotaExhaustedError extends Error {
	constructor(
		public readonly trialTotal: number,
		public readonly trialTokensLeft = 0,
	) {
		super("Trial token budget exhausted. Configure your own API key to continue using AI features.");
		this.name = "TrialQuotaExhaustedError";
	}
}

export type TrialQuotaBalance = {
	trialTokensLeft: number;
	trialTotal: number;
};

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
	raw: unknown;
};

export type ChatRequest = {
	messages: ChatMessage[];
	options?: ChatOptions;
	userId?: string;
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

// ── Trial quota helpers ──────────────────────────────────────────────

const DEFAULT_TRIAL_TOKEN_BUDGET = 50_000;

export function getTrialTokenBudget(): number {
	const raw = env.TRIAL_TOKEN_BUDGET?.trim();
	if (!raw) return DEFAULT_TRIAL_TOKEN_BUDGET;

	const parsed = Number.parseInt(raw, 10);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		throw new Error("TRIAL_TOKEN_BUDGET must be a positive integer");
	}
	return parsed;
}

export async function hasUserApiKey(userId: string): Promise<boolean> {
	const row = await db.query.userApiKey.findFirst({
		where: eq(userApiKey.userId, userId),
		columns: { userId: true },
	});
	return row !== undefined;
}

async function ensureUserQuota(userId: string): Promise<TrialQuotaBalance> {
	const existing = await db.query.userQuota.findFirst({
		where: eq(userQuota.userId, userId),
		columns: { trialTokens: true, trialTotalTokens: true },
	});
	if (existing) {
		return { trialTokensLeft: existing.trialTokens, trialTotal: existing.trialTotalTokens };
	}

	const budget = getTrialTokenBudget();
	const [inserted] = await db
		.insert(userQuota)
		.values({ userId, trialTokens: budget, trialTotalTokens: budget })
		.onConflictDoNothing()
		.returning({ trialTokens: userQuota.trialTokens, trialTotalTokens: userQuota.trialTotalTokens });

	if (inserted) {
		return { trialTokensLeft: inserted.trialTokens, trialTotal: inserted.trialTotalTokens };
	}

	const row = await db.query.userQuota.findFirst({
		where: eq(userQuota.userId, userId),
		columns: { trialTokens: true, trialTotalTokens: true },
	});
	if (!row) throw new Error("Failed to initialize trial quota");
	return { trialTokensLeft: row.trialTokens, trialTotal: row.trialTotalTokens };
}

export async function getTrialTokensLeft(userId: string): Promise<number> {
	return (await ensureUserQuota(userId)).trialTokensLeft;
}

export async function getTrialQuotaBalance(userId: string): Promise<TrialQuotaBalance> {
	return ensureUserQuota(userId);
}

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

type OpenAIConfig = {
	apiKey: string;
	baseUrl: string;
	model: string;
};

function getEnvOpenAIConfig(): OpenAIConfig {
	const apiKey = env.OPENAI_API_KEY?.trim();
	if (!apiKey) {
		throw new Error("OPENAI_API_KEY is not set. Please set OPENAI_API_KEY in .env");
	}

	const baseUrlRaw = env.OPENAI_BASE_URL?.trim();
	if (!baseUrlRaw) {
		throw new Error("OPENAI_BASE_URL is not set. Please set OPENAI_BASE_URL in .env");
	}

	const model = env.OPENAI_MODEL?.trim();
	if (!model) {
		throw new Error("OPENAI_MODEL is not set. Please set OPENAI_MODEL in .env");
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

async function resolveOpenAIConfig(userId?: string): Promise<OpenAIConfig> {
	if (userId) {
		const userConfig = await getUserOpenAIConfig(userId);
		if (userConfig) {
			debugLog("config", { source: "byok", model: userConfig.model, baseUrl: userConfig.baseUrl });
			return userConfig;
		}
	}

	const envConfig = getEnvOpenAIConfig();
	debugLog("config", { source: "env", model: envConfig.model, baseUrl: envConfig.baseUrl });
	return envConfig;
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

function parseStructuredOutputText<T extends z.ZodType>(schema: T, text: string): z.infer<T> {
	const candidates = [...new Set([extractJsonValue(text), repairMalformedJson(text)])];

	for (const candidate of candidates) {
		try {
			return schema.parse(JSON.parse(candidate)) as z.infer<T>;
		} catch {
			// Try the next recovery candidate.
		}
	}

	throw new Error(`LLM returned invalid structured JSON: ${text.slice(0, 300)}`);
}

// ── OpenAI call ───────────────────────────────────────────────────────

type CompletionOptions = ChatOptions & {
	tools?: ChatTool[];
	toolChoice?: ChatCompletionToolChoiceOption;
};

async function callChatCompletion(messages: ChatMessage[], options: CompletionOptions = {}, userId?: string): Promise<ChatCompletion> {
	validateMessages(messages);

	const config = await resolveOpenAIConfig(userId);
	const url = `${config.baseUrl}/chat/completions`;
	const request: ChatCompletionCreateParamsNonStreaming = {
		model: config.model,
		messages: toOpenAIMessages(messages),
		max_tokens: options.maxTokens ?? 4096,
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
		throw new Error(`OpenAI API error: ${responseError.message ?? JSON.stringify(responseError)}`);
	}

	debugLog("response", { url, status: response.status, body: completion });

	return completion;
}

function completionContent(completion: ChatCompletion) {
	return completion.choices[0]?.message.content?.trim() ?? "";
}

function completionResponse(completion: ChatCompletion): ChatResponse {
	return {
		id: completion.id,
		model: completion.model,
		content: completionContent(completion),
		raw: completion,
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
	if (error instanceof OpenAI.APIConnectionError && error.cause instanceof Error) {
		return error.cause;
	}

	if (error instanceof OpenAI.APIError && typeof error.status === "number") {
		const message = `OpenAI API error (${error.status}): ${error.message}`;
		if (error.status === 401 || error.status === 403) {
			return new OpenAIAuthError(message, error.status);
		}
		return new Error(message);
	}

	return error instanceof Error ? error : new Error(String(error));
}

// ── Public facade ─────────────────────────────────────────────────────

export async function chatText({ messages, options = {}, userId }: ChatRequest): Promise<ChatResponse> {
	const completion = await callChatCompletion(messages, options, userId);
	const response = completionResponse(completion);
	if (!response.content) {
		throw new Error("LLM returned empty content");
	}
	return response;
}

export async function chatJson<T extends z.ZodType>(schema: T, { messages, options = {}, userId }: ChatRequest): Promise<z.infer<T>> {
	const first = await chatText({ messages, options, userId });

	try {
		return parseStructuredOutputText(schema, first.content);
	} catch (firstError) {
		const retry = await chatText({ messages, options, userId });

		try {
			return parseStructuredOutputText(schema, retry.content);
		} catch {
			throw firstError;
		}
	}
}

export async function chatTools({ messages, tools, options = {}, userId }: ToolChatRequest): Promise<ToolChatResponse> {
	if (!Array.isArray(tools) || tools.length === 0) {
		throw new Error("tools must contain at least one item");
	}

	const completion = await callChatCompletion(messages, { ...options, tools, toolChoice: options.toolChoice }, userId);
	const response = completionResponse(completion);
	const toolCalls = completionToolCalls(completion);

	if (!response.content && toolCalls.length === 0) {
		throw new Error("LLM returned empty content");
	}

	return {
		...response,
		toolCalls,
	};
}
