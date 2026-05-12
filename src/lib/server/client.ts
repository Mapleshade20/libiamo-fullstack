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

// ── Env helpers ───────────────────────────────────────────────────────

function getOpenAIConfig() {
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

	return {
		apiKey,
		baseUrl,
		model,
	};
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
	let cleaned = text.trim();
	cleaned = cleaned.replace(/^`{3}(?:json)?/i, "").trim();
	cleaned = cleaned.replace(/`{3}$/i, "").trim();
	return cleaned;
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

async function createChatCompletion(messages: ChatMessage[], options: OpenAIOptions = {}): Promise<OpenAIResponse> {
	validateMessages(messages);

	const { apiKey, baseUrl, model } = getOpenAIConfig();

	const response = await fetch(`${baseUrl}/chat/completions`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${apiKey}`,
		},
		body: JSON.stringify({
			model,
			messages,
			temperature: options.temperature ?? 0.7,
			max_tokens: options.maxTokens ?? 4096,
		}),
	});

	const bodyText = await response.text();

	if (!response.ok) {
		throw new Error(`OpenAI API error (${response.status}): ${bodyText}`);
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

	const content = data.choices?.[0]?.message?.content?.trim() ?? "";

	if (!content) {
		throw new Error("OpenAI API returned empty content");
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
): Promise<z.infer<T>> {
	validateMessages(messages);

	const textOnlyMessages: ChatMessage[] = [
		...messages,
		{
			role: "user",
			content: "Return ONLY one valid JSON object that satisfies the requested schema. Do not use markdown, comments, or extra text.",
		},
	];

	const firstResult = await createChatCompletion(textOnlyMessages, options);
	const firstText = firstResult.content.trim();

	try {
		return parseStructuredOutputText(schema, firstText);
	} catch (firstError) {
		const retryResult = await createChatCompletion(
			[
				...textOnlyMessages,
				{
					role: "assistant",
					content: firstText || "(empty response)",
				},
				{
					role: "user",
					content:
						"The previous response was invalid or incomplete. Return ONLY a complete valid JSON object with all required fields for the requested schema.",
				},
			],
			{
				...options,
				temperature: 0,
			},
		);

		const retryText = retryResult.content.trim();

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

	const reply = await createChatCompletion(requestMessages, input.options ?? {});

	return {
		reply,
		messages: [...requestMessages, { role: "assistant", content: reply.content }],
	};
}
