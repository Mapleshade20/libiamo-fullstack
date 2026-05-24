import { eq } from "drizzle-orm";
import OpenAI from "openai";
import type { ChatCompletion, ChatCompletionMessageParam } from "openai/resources/chat/completions";
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

function normalizeMessages(messages: ChatMessage[]): ChatMessage[] {
	const normalized: ChatMessage[] = [];

	for (const message of messages) {
		const current = { role: message.role, content: message.content.trim() };
		const previous = normalized.at(-1);

		if (previous?.role === current.role) {
			previous.content = `${previous.content.trimEnd()}\n\n${current.content.trimStart()}`;
		} else {
			normalized.push(current);
		}
	}

	return normalized;
}

function toOpenAIMessages(messages: ChatMessage[]): ChatCompletionMessageParam[] {
	return normalizeMessages(messages) as ChatCompletionMessageParam[];
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

// ── Core LLM function using OpenAI SDK ────────────────────────────────

async function createChatCompletion(messages: ChatMessage[], options: OpenAIOptions = {}, userId?: string): Promise<OpenAIResponse> {
	validateMessages(messages);

	const config = await resolveOpenAIConfig(userId);
	const url = `${config.baseUrl}/chat/completions`;
	const request = {
		model: config.model,
		messages: toOpenAIMessages(messages),
		max_tokens: options.maxTokens ?? 4096,
		...(options.temperature === undefined ? {} : { temperature: options.temperature }),
	};

	debugLog("request", {
		url,
		body: request,
	});

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

	const content = completion.choices[0]?.message.content?.trim() ?? "";
	if (!content) {
		throw new Error("LLM returned empty content");
	}

	return {
		id: completion.id,
		model: completion.model,
		content,
		raw: completion,
	};
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

// ── Structured output ─────────────────────────────────────────────────

export async function createStructuredOutput<T extends z.ZodType>(
	schema: T,
	messages: ChatMessage[],
	options: OpenAIOptions = {},
	userId?: string,
): Promise<z.infer<T>> {
	validateMessages(messages);

	const firstResult = await createChatCompletion(messages, options, userId);
	const firstText = firstResult.content.trim();

	try {
		return parseStructuredOutputText(schema, firstText);
	} catch (firstError) {
		const retryResult = await createChatCompletion(
			[
				...messages,
				{
					role: "assistant",
					content: firstText || "(empty response)",
				},
				{
					role: "system",
					content:
						"The previous response was invalid or incomplete. Return ONLY a complete valid JSON object with all required fields for the requested schema.",
				},
			],
			options,
			userId,
		);

		try {
			return parseStructuredOutputText(schema, retryResult.content.trim());
		} catch {
			throw firstError;
		}
	}
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
