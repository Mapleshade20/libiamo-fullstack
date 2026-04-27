// Force disable SSL verification for self-signed certificates in development
// This must be set before any HTTPS requests are made
if (process.env.NODE_TLS_REJECT_UNAUTHORIZED !== "1") {
	process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

process.env.AI_SDK_LOG_WARNINGS = "false";

import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText } from "ai";
import type { z } from "zod";
import { env } from "$env/dynamic/private";

// ── Types ─────────────────────────────────────────────────────────────

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

// ── Provider ──────────────────────────────────────────────────────────

function createProvider() {
	const apiKey = env.OPENAI_API_KEY?.trim();
	if (!apiKey) {
		throw new Error("OPENAI_API_KEY is not set. Please set OPENAI_API_KEY in .env");
	}

	const baseUrlRaw = env.OPENAI_BASE_URL?.trim();
	if (!baseUrlRaw) {
		throw new Error("OPENAI_BASE_URL is not set. Please set OPENAI_BASE_URL in .env");
	}

	const baseURL = baseUrlRaw.endsWith("/") ? baseUrlRaw.slice(0, -1) : baseUrlRaw;

	return createOpenAICompatible({
		name: "libiamo-llm",
		baseURL,
		apiKey,
	});
}

function getModel() {
	const model = env.OPENAI_MODEL?.trim();
	if (!model) {
		throw new Error("OPENAI_MODEL is not set. Please set OPENAI_MODEL in .env");
	}
	return createProvider()(model);
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

function stripJsonFences(text: string) {
	return text
		.trim()
		.replace(/^```(?:json)?\s*/i, "")
		.replace(/\s*```$/i, "")
		.trim();
}

function extractJsonObject(text: string) {
	const stripped = stripJsonFences(text);
	const start = stripped.indexOf("{");
	const end = stripped.lastIndexOf("}");
	if (start === -1 || end === -1 || end <= start) return stripped;
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

// ── Core LLM functions using AI SDK ───────────────────────────────────

/**
 * Generate text from messages using the AI SDK.
 * Replaces the hand-rolled fetch + JSON parsing.
 */
async function createChatCompletion(messages: ChatMessage[], options: OpenAIOptions = {}): Promise<OpenAIResponse> {
	validateMessages(messages);

	const result = await generateText({
		model: getModel(),
		messages,
		temperature: options.temperature ?? 0.7,
		maxOutputTokens: options.maxTokens ?? 4096,
	});

	const content = result.text?.trim() ?? "";
	if (!content) {
		throw new Error("LLM returned empty content");
	}

	return {
		id: result.response?.id,
		model: result.response?.modelId,
		content,
		raw: result.response,
	};
}

/**
 * Generate structured JSON output validated against a Zod schema.
 * Uses plain text generation instead of AI SDK output.object() because some
 * OpenAI-compatible providers used here do not support responseFormat.
 */
export async function createStructuredOutput<T extends z.ZodType>(
	schema: T,
	messages: ChatMessage[],
	options: OpenAIOptions = {},
): Promise<z.infer<T>> {
	validateMessages(messages);

	const textOnlyMessages: ChatMessage[] = [
		...messages,
		{
			role: "user",
			content: "Return ONLY one valid JSON object that satisfies the requested schema. Do not use markdown, comments, or extra text.",
		},
	];

	const firstResult = await generateText({
		model: getModel(),
		messages: textOnlyMessages,
		temperature: options.temperature ?? 0.7,
		maxOutputTokens: options.maxTokens ?? 4096,
	});
	const firstText = firstResult.text?.trim() ?? "";
	try {
		return parseStructuredOutputText(schema, firstText);
	} catch (firstError) {
		const retryResult = await generateText({
			model: getModel(),
			messages: [
				...textOnlyMessages,
				{ role: "assistant", content: firstText || "(empty response)" },
				{
					role: "user",
					content:
						"The previous response was invalid or incomplete. Return ONLY a complete valid JSON object with all required fields for the requested schema.",
				},
			],
			temperature: 0,
			maxOutputTokens: options.maxTokens ?? 4096,
		});
		const retryText = retryResult.text?.trim() ?? "";
		try {
			return parseStructuredOutputText(schema, retryText);
		} catch {
			throw firstError;
		}
	}
}

// ── High-level chat functions ─────────────────────────────────────────

export async function createSingleTurnChat(input: SingleTurnChatInput): Promise<ConversationTurnResult> {
	if (typeof input.systemPrompt !== "string" || !input.systemPrompt.trim()) {
		throw new Error("systemPrompt is required");
	}
	if (typeof input.userMessage !== "string" || !input.userMessage.trim()) {
		throw new Error("userMessage is required");
	}
	const requestMessages: ChatMessage[] = [];
	requestMessages.push({ role: "system", content: input.systemPrompt.trim() });
	requestMessages.push({ role: "user", content: input.userMessage.trim() });
	const reply = await createChatCompletion(requestMessages, input.options ?? {});
	return {
		reply,
		messages: [...requestMessages, { role: "assistant", content: reply.content }],
	};
}

export async function createMultiTurnChat(input: MultiTurnChatInput): Promise<ConversationTurnResult> {
	if (typeof input.userMessage !== "string" || !input.userMessage.trim()) {
		throw new Error("userMessage is required");
	}
	if (!Array.isArray(input.history)) {
		throw new Error("history must be an array");
	}

	const history = input.history.map((msg) => {
		if (typeof msg.content !== "string") {
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
			history[systemIndex] = { role: "system", content: systemPrompt };
		} else {
			history.unshift({ role: "system", content: systemPrompt });
		}
	} else {
		const hasSystemInHistory = history.some((msg) => msg.role === "system" && msg.content.trim().length > 0);
		if (!hasSystemInHistory) {
			throw new Error("systemPrompt is required for the first turn, or history must include a system message");
		}
	}

	const requestMessages: ChatMessage[] = [...history, { role: "user", content: input.userMessage.trim() }];
	const reply = await createChatCompletion(requestMessages, input.options ?? {});

	return {
		reply,
		messages: [...requestMessages, { role: "assistant", content: reply.content }],
	};
}
