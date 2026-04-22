// Force disable SSL verification for self-signed certificates in development
// This must be set before any HTTPS requests are made
if (process.env.NODE_TLS_REJECT_UNAUTHORIZED !== "1") {
	process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

import { env } from "$env/dynamic/private";

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

type ChatCompletionChunk = {
	choices?: Array<{
		message?: {
			content?: string;
		};
	}>;
	id?: string;
	model?: string;
};

async function createChatCompletion(messages: ChatMessage[], options: OpenAIOptions = {}): Promise<OpenAIResponse> {
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

	if (!response.ok) {
		const bodyText = await response.text();
		throw new Error(`OpenAI API error (${response.status}): ${bodyText}`);
	}

	const data = (await response.json()) as ChatCompletionChunk;

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
