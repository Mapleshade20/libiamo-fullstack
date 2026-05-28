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
import { decryptApiKey } from "./api-key-crypto";
import { createPinnedByokFetch } from "./byok-fetch";
import { resolveByokBaseUrl } from "./byok-url";
import { db } from "./db";
import { userApiKey } from "./db/schema";
import { recordLlmTokens } from "./rate-limit-llm";

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
	usage?: { totalTokens: number };
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

// ── Config resolution ─────────────────────────────────────────────────

type OpenAIConfig = {
	apiKey: string;
	baseUrl: string;
	model: string;
	fetch?: typeof fetch;
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

	const resolvedBaseUrl = await resolveByokBaseUrl(row.baseUrl);

	return {
		apiKey: decryptApiKey(row.encryptedKey),
		baseUrl: resolvedBaseUrl.baseUrl,
		model: row.model,
		fetch: createPinnedByokFetch(resolvedBaseUrl),
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
		...(config.fetch ? { fetch: config.fetch } : {}),
		fetchOptions: { redirect: "manual" },
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
		usage: completion.usage ? { totalTokens: completion.usage.total_tokens } : undefined,
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
	if (userId && response.usage?.totalTokens) {
		recordLlmTokens(userId, response.usage.totalTokens);
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
