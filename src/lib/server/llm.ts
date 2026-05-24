import { eq } from "drizzle-orm";
import type { z } from "zod";
import { env } from "$env/dynamic/private";
import { decryptApiKey } from "./api-key-crypto";
import { db } from "./db";
import { userApiKey } from "./db/schema";

// ── Types ─────────────────────────────────────────────────────────────

/** Thrown when the API key is invalid, expired, or unauthorized (401/403) */
export class OpenAIAuthError extends Error {
	constructor(
		message: string,
		public readonly status: number,
	) {
		super(message);
		this.name = "OpenAIAuthError";
	}
}

/** Thrown when an LLM response could not be parsed as the requested structured schema after retry. */
export class StructuredOutputParseError extends Error {
	constructor(
		public readonly firstText: string,
		public readonly retryText?: string,
		public readonly cause?: unknown,
	) {
		super(`LLM returned invalid structured JSON: ${(retryText || firstText).slice(0, 500)}`);
		this.name = "StructuredOutputParseError";
	}
}

/** Thrown when the provider says the response did not finish normally. */
export class LLMIncompleteResponseError extends Error {
	constructor(
		public readonly finishReason: string,
		public readonly content: string,
	) {
		super(`LLM response did not complete normally (finish_reason: ${finishReason})`);
		this.name = "LLMIncompleteResponseError";
	}
}

export type ChatMessage = {
	role: "system" | "user" | "assistant";
	content: string;
};

export type OpenAIOptions = {
	temperature?: number;
	maxTokens?: number;
};

export type OpenAIResponse = {
	id?: string;
	model?: string;
	content: string;
	raw: unknown;
};

export type ConversationTurnResult = {
	reply: OpenAIResponse;
	messages: ChatMessage[];
};

export type SingleTurnChatInput = {
	systemPrompt: string;
	userMessage: string;
	options?: OpenAIOptions;
};

export type MultiTurnChatInput = {
	history: ChatMessage[];
	userMessage: string;
	systemPrompt?: string;
	options?: OpenAIOptions;
};

// ── OpenAI-compatible response types ──────────────────────────────────

type ChatCompletionResponse = {
	id?: string;
	model?: string;
	choices?: Array<{
		message?: {
			role?: string;
			content?: string | null;
		};
		finish_reason?: string | null;
		index?: number;
	}>;
	error?: {
		message?: string;
		type?: string;
		code?: string | number;
	};
};

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

	const baseUrl = baseUrlRaw.endsWith("/") ? baseUrlRaw.slice(0, -1) : baseUrlRaw;

	return { apiKey, baseUrl, model };
}

async function getUserOpenAIConfig(userId: string): Promise<OpenAIConfig | null> {
	const row = await db.query.userApiKey.findFirst({
		where: eq(userApiKey.userId, userId),
	});

	if (!row) return null;

	const apiKey = decryptApiKey(row.encryptedKey);
	const baseUrl = row.baseUrl.endsWith("/") ? row.baseUrl.slice(0, -1) : row.baseUrl;

	return { apiKey, baseUrl, model: row.model };
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

// ── Debug helpers ─────────────────────────────────────────────────────

function isLlmDebugEnabled() {
	const value = env.LLM_DEBUG?.trim().toLowerCase();
	return value === "1" || value === "true" || value === "yes" || value === "on";
}

function safeJsonParse(text: string): unknown {
	try {
		return JSON.parse(text) as unknown;
	} catch {
		return text;
	}
}

function debugLog(event: string, details: Record<string, unknown>) {
	if (!isLlmDebugEnabled()) return;

	try {
		console.info(`[llm-debug] ${event}`, JSON.stringify(details, null, 2));
	} catch {
		console.info(`[llm-debug] ${event}`, details);
	}
}

// ── Validation helpers ────────────────────────────────────────────────

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

function mergeAdjacentMessages(messages: ChatMessage[]): ChatMessage[] {
	const merged: ChatMessage[] = [];

	for (const message of messages) {
		const previous = merged.at(-1);

		if (previous?.role === message.role) {
			previous.content = `${previous.content.trimEnd()}\n\n${message.content.trimStart()}`;
		} else {
			merged.push({ ...message });
		}
	}

	return merged;
}

export function stripJsonFences(text: string) {
	let cleaned = text.trim();
	cleaned = cleaned.replace(/^`{3}(?:json)?/i, "").trim();
	cleaned = cleaned.replace(/`{3}$/i, "").trim();
	return cleaned;
}

/** Extract content from inside a markdown code fence, handling mid-text fences */
export function extractContentFromFence(text: string): string {
	const trimmed = text.trim();
	const fenceStart = trimmed.indexOf("```");
	if (fenceStart !== -1) {
		let after = trimmed.slice(fenceStart + 3);
		if (after.startsWith("json")) after = after.slice(4);
		after = after.trimStart();
		const fenceEnd = after.indexOf("```");
		if (fenceEnd !== -1) return after.slice(0, fenceEnd).trim();
	}
	return trimmed;
}

function extractJsonObject(text: string) {
	const stripped = stripJsonFences(text);
	const start = stripped.indexOf("{");
	const end = stripped.lastIndexOf("}");

	if (start === -1 || end === -1 || end <= start) {
		return stripped;
	}

	return stripped.slice(start, end + 1);
}

function repairMalformedJson(text: string) {
	return extractJsonObject(text).replace(/"\s+([A-Za-z_$][\w$-]*)"\s*:/g, '"$1":');
}

function parseStructuredOutputText<T extends z.ZodType>(schema: T, text: string): z.infer<T> {
	const candidates = [extractJsonObject(text), repairMalformedJson(text)];

	for (const candidate of candidates) {
		try {
			return schema.parse(JSON.parse(candidate)) as z.infer<T>;
		} catch {
			// Try the next recovery candidate.
		}
	}

	throw new Error(`LLM returned invalid structured JSON: ${text.slice(0, 500)}`);
}

// ── Core LLM function using fetch ─────────────────────────────────────

async function createChatCompletion(messages: ChatMessage[], options: OpenAIOptions = {}, userId?: string): Promise<OpenAIResponse> {
	validateMessages(messages);

	const { apiKey, baseUrl, model } = await resolveOpenAIConfig(userId);
	const endpoint = `${baseUrl}/chat/completions`;
	const requestBody: Record<string, unknown> = {
		model,
		messages: mergeAdjacentMessages(messages),
		max_tokens: options.maxTokens ?? 4096,
	};

	// Only include temperature if explicitly requested (some models only accept specific values)
	if (options.temperature !== undefined) {
		requestBody.temperature = options.temperature;
	}

	debugLog("request", {
		url: endpoint,
		body: requestBody,
	});

	let response: Response;

	try {
		response = await fetch(endpoint, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${apiKey}`,
			},
			body: JSON.stringify(requestBody),
		});
	} catch (error) {
		debugLog("network-error", {
			url: endpoint,
			message: error instanceof Error ? error.message : String(error),
		});
		throw error;
	}

	const bodyText = await response.text();

	debugLog("response", {
		url: endpoint,
		status: response.status,
		ok: response.ok,
		body: safeJsonParse(bodyText),
	});

	if (!response.ok) {
		const msg = `OpenAI API error (${response.status}): ${bodyText}`;
		if (response.status === 401 || response.status === 403) {
			throw new OpenAIAuthError(msg, response.status);
		}
		throw new Error(msg);
	}

	let data: ChatCompletionResponse;

	try {
		data = JSON.parse(bodyText) as ChatCompletionResponse;
	} catch {
		throw new Error(`OpenAI API returned non-JSON response: ${bodyText.slice(0, 500)}`);
	}

	if (data.error) {
		throw new Error(`OpenAI API error: ${data.error.message ?? JSON.stringify(data.error)}`);
	}

	const firstChoice = data.choices?.[0];
	const content = firstChoice?.message?.content?.trim() ?? "";
	const finishReason = firstChoice?.finish_reason ?? null;

	if (!content) {
		throw new Error("LLM returned empty content");
	}

	if (finishReason && finishReason !== "stop") {
		throw new LLMIncompleteResponseError(finishReason, content);
	}

	return {
		id: data.id,
		model: data.model,
		content,
		raw: data,
	};
}

// ── Structured output ─────────────────────────────────────────────────

export async function createStructuredOutput<T extends z.ZodType>(
	schema: T,
	messages: ChatMessage[],
	options: OpenAIOptions = {},
	userId?: string,
): Promise<z.infer<T>> {
	validateMessages(messages);

	let firstResult: OpenAIResponse;

	try {
		firstResult = await createChatCompletion(messages, options, userId);
	} catch (firstError) {
		if (!(firstError instanceof LLMIncompleteResponseError)) throw firstError;

		const firstText = firstError.content.trim();
		const retryText = await retryStructuredOutputRequest(messages, firstText, options, userId);

		try {
			return parseStructuredOutputText(schema, retryText);
		} catch {
			throw new StructuredOutputParseError(firstText, retryText, firstError);
		}
	}

	const firstText = firstResult.content.trim();

	try {
		return parseStructuredOutputText(schema, firstText);
	} catch (firstError) {
		const retryText = await retryStructuredOutputRequest(messages, firstText, options, userId);

		try {
			return parseStructuredOutputText(schema, retryText);
		} catch {
			throw new StructuredOutputParseError(firstText, retryText, firstError);
		}
	}
}

async function retryStructuredOutputRequest(messages: ChatMessage[], previousText: string, options: OpenAIOptions, userId?: string): Promise<string> {
	const retryResult = await createChatCompletion(
		[
			...messages,
			{
				role: "assistant",
				content: previousText || "(empty response)",
			},
			{
				role: "system",
				content:
					"The previous response was invalid or incomplete. Return ONLY a complete valid JSON object with all required fields for the requested schema.",
			},
		],
		{
			...options,
		},
		userId,
	);

	return retryResult.content.trim();
}

// ── High-level chat functions ─────────────────────────────────────────

export async function createSingleTurnChat(input: SingleTurnChatInput, userId?: string): Promise<ConversationTurnResult> {
	if (typeof input.systemPrompt !== "string" || !input.systemPrompt.trim()) {
		throw new Error("systemPrompt is required");
	}

	if (typeof input.userMessage !== "string" || !input.userMessage.trim()) {
		throw new Error("userMessage is required");
	}

	const requestMessages: ChatMessage[] = [
		{
			role: "system",
			content: input.systemPrompt.trim(),
		},
		{
			role: "user",
			content: input.userMessage.trim(),
		},
	];

	const reply = await createChatCompletion(requestMessages, input.options ?? {}, userId);

	return {
		reply,
		messages: [...requestMessages, { role: "assistant", content: reply.content }],
	};
}

export async function createMultiTurnChat(input: MultiTurnChatInput, userId?: string): Promise<ConversationTurnResult> {
	if (typeof input.userMessage !== "string" || !input.userMessage.trim()) {
		throw new Error("userMessage is required");
	}

	if (!Array.isArray(input.history)) {
		throw new Error("history must be an array");
	}

	const history: ChatMessage[] = input.history.map((msg) => {
		if (!msg || !["system", "user", "assistant"].includes(msg.role)) {
			throw new Error("each message.role must be one of: system, user, assistant");
		}

		if (typeof msg.content !== "string" || !msg.content.trim()) {
			throw new Error("each message.content must be a non-empty string");
		}

		return {
			role: msg.role,
			content: msg.content.trim(),
		};
	});

	const systemPrompt = typeof input.systemPrompt === "string" ? input.systemPrompt.trim() : undefined;

	if (systemPrompt) {
		const systemIndex = history.findIndex((msg) => msg.role === "system");

		if (systemIndex >= 0) {
			history[systemIndex] = {
				role: "system",
				content: systemPrompt,
			};
		} else {
			history.unshift({
				role: "system",
				content: systemPrompt,
			});
		}
	} else {
		const hasSystemInHistory = history.some((msg) => msg.role === "system" && msg.content.trim().length > 0);

		if (!hasSystemInHistory) {
			throw new Error("systemPrompt is required for the first turn, or history must include a system message");
		}
	}

	const requestMessages: ChatMessage[] = [
		...history,
		{
			role: "user",
			content: input.userMessage.trim(),
		},
	];

	const reply = await createChatCompletion(requestMessages, input.options ?? {}, userId);

	return {
		reply,
		messages: [...requestMessages, { role: "assistant", content: reply.content }],
	};
}
