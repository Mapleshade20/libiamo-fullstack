/**
 * Server-side feedback generation.
 * Builds the annotation prompt, calls LLM, parses XML, persists result.
 */

import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { getLanguageEnglishName, type UiVariant } from "$lib/constants";
import type { FeedbackChain, FeedbackConversation, FeedbackMessage, FeedbackResult } from "$lib/feedback-types";
import { db } from "./db";
import { practiceSession, sessionMessage } from "./db/schema";
import { isFeedbackResultValid, parseFeedbackXml } from "./feedback-parser";
import { type ChatMessage, chatJson, chatText } from "./llm";

// ── Message metadata helpers ─────────────────────────────────────────

type SessionMessageRow = {
	id: number;
	role: string;
	content: string;
	createdAt: string | Date;
	llmMetadata: unknown;
};

type MessageMetadata = {
	clientMessageId?: string;
	hidden?: boolean;
	displayContent?: string;
	thread?: {
		commentId?: string;
		targetCommentId?: string | null;
		parentCommentId?: string | null;
		responderName?: string;
	};
};

function getMetadata(value: unknown): MessageMetadata {
	if (!value || typeof value !== "object" || Array.isArray(value)) return {};
	return value as MessageMetadata;
}

function isHidden(msg: SessionMessageRow): boolean {
	return getMetadata(msg.llmMetadata).hidden === true;
}

function getDisplayContent(msg: SessionMessageRow): string {
	return getMetadata(msg.llmMetadata).displayContent ?? msg.content;
}

// ── Tree flattening for Reddit/AO3 ──────────────────────────────────

type TreeNode = {
	id: string;
	role: "user" | "agent" | "context";
	author: string;
	text: string;
	parentId: string | null;
	children: TreeNode[];
};

function buildMessageTree(messages: SessionMessageRow[], openingState: Record<string, unknown>, ui: UiVariant): TreeNode[] {
	const nodes: TreeNode[] = [];
	const nodeMap = new Map<string, TreeNode>();

	// Add opening state context as root nodes
	if (ui === "reddit") {
		const post = openingState.post as { title?: string; body?: string; author?: string } | undefined;
		if (post) {
			const postNode: TreeNode = {
				id: "post-root",
				role: "context",
				author: post.author ?? "OP",
				text: `[Post] ${post.title ?? ""}${post.body ? `: ${post.body}` : ""}`,
				parentId: null,
				children: [],
			};
			nodes.push(postNode);
			nodeMap.set(postNode.id, postNode);
		}

		// Add opening comments
		const comments = openingState.previousComments as Array<{ id?: string; author?: string; text?: string; replies?: unknown }> | undefined;
		if (comments) {
			addOpeningComments(comments, "post-root", nodes, nodeMap);
		}
	} else if (ui === "ao3") {
		const workTitle = openingState.workTitle as string | undefined;
		const rootNode: TreeNode = {
			id: "work-root",
			role: "context",
			author: (openingState.authorName as string) ?? "Author",
			text: `[Work] ${workTitle ?? "Untitled"}`,
			parentId: null,
			children: [],
		};
		nodes.push(rootNode);
		nodeMap.set(rootNode.id, rootNode);

		const comments = openingState.previousComments as Array<{ id?: string; username?: string; comment?: string; replies?: unknown }> | undefined;
		if (comments) {
			addAo3OpeningComments(comments, "work-root", nodes, nodeMap);
		}
	}

	// Add session messages to the tree
	for (const msg of messages) {
		if (isHidden(msg)) continue;
		const metadata = getMetadata(msg.llmMetadata);
		const thread = metadata.thread;
		const commentId = thread?.commentId ?? `msg-${msg.id}`;
		const parentId = msg.role === "user" ? (thread?.targetCommentId ?? null) : (thread?.parentCommentId ?? null);

		const node: TreeNode = {
			id: commentId,
			role: msg.role === "user" ? "user" : "agent",
			author: msg.role === "user" ? "You" : (thread?.responderName ?? "Agent"),
			text: getDisplayContent(msg),
			parentId,
			children: [],
		};

		nodeMap.set(commentId, node);

		if (parentId && nodeMap.has(parentId)) {
			nodeMap.get(parentId)?.children.push(node);
		} else {
			nodes.push(node);
		}
	}

	return nodes;
}

function addOpeningComments(
	comments: Array<{ id?: string; author?: string; text?: string; replies?: unknown }>,
	parentId: string,
	nodes: TreeNode[],
	nodeMap: Map<string, TreeNode>,
	path: number[] = [],
) {
	for (const [i, comment] of comments.entries()) {
		const currentPath = [...path, i];
		const id = comment.id ?? `opening-${currentPath.join("-")}`;
		const node: TreeNode = {
			id,
			role: "context",
			author: comment.author ?? "Anonymous",
			text: comment.text ?? "",
			parentId,
			children: [],
		};
		nodeMap.set(id, node);

		if (nodeMap.has(parentId)) {
			nodeMap.get(parentId)?.children.push(node);
		} else {
			nodes.push(node);
		}

		const replies = Array.isArray(comment.replies) ? (comment.replies as typeof comments) : [];
		if (replies.length) {
			addOpeningComments(replies, id, nodes, nodeMap, currentPath);
		}
	}
}

function addAo3OpeningComments(
	comments: Array<{ id?: string; username?: string; comment?: string; replies?: unknown }>,
	parentId: string,
	nodes: TreeNode[],
	nodeMap: Map<string, TreeNode>,
	path: number[] = [],
) {
	for (const [i, comment] of comments.entries()) {
		const currentPath = [...path, i];
		const id = comment.id ?? `opening-${currentPath.join("-")}`;
		const node: TreeNode = {
			id,
			role: "context",
			author: comment.username ?? "Anonymous",
			text: comment.comment ?? "",
			parentId,
			children: [],
		};
		nodeMap.set(id, node);

		if (nodeMap.has(parentId)) {
			nodeMap.get(parentId)?.children.push(node);
		} else {
			nodes.push(node);
		}

		const replies = Array.isArray(comment.replies) ? (comment.replies as typeof comments) : [];
		if (replies.length) {
			addAo3OpeningComments(replies, id, nodes, nodeMap, currentPath);
		}
	}
}

/**
 * Flatten a tree into linear chains.
 * Each chain is a path from a root/branch point to a leaf.
 * User messages appear only once (in their first chain occurrence).
 */
function flattenTreeToChains(roots: TreeNode[]): FeedbackChain[] {
	const chains: FeedbackChain[] = [];
	const visitedUserMessages = new Set<string>();
	let seqCounter = 0;

	function traceChain(node: TreeNode, ancestorPath: TreeNode[]): void {
		const currentPath = [...ancestorPath, node];

		if (node.children.length === 0) {
			// Leaf node — emit this chain
			const messages: FeedbackMessage[] = currentPath.map((n) => {
				seqCounter++;
				if (n.role === "user") visitedUserMessages.add(n.id);
				return {
					seqId: seqCounter,
					role: n.role,
					author: n.author,
					text: n.text,
					chainIndex: chains.length,
				};
			});
			chains.push({
				label: `Thread ${chains.length + 1}`,
				messages,
			});
		} else if (node.children.length === 1) {
			// Single child — continue the chain
			traceChain(node.children[0], currentPath);
		} else {
			// Branch point — each child starts a new chain from here
			for (const child of node.children) {
				traceChain(child, currentPath);
			}
		}
	}

	for (const root of roots) {
		traceChain(root, []);
	}

	return chains;
}

// ── Linear conversation builder (non-tree UIs) ──────────────────────

function buildLinearConversation(messages: SessionMessageRow[], openingState: Record<string, unknown>, ui: UiVariant): FeedbackConversation {
	const feedbackMessages: FeedbackMessage[] = [];
	let seqCounter = 0;

	// Add opening context for non-tree UIs
	if (ui === "discord") {
		const prevMsgs = (openingState.previousMessages as Array<{ sender?: string; text?: string }>) ?? [];
		for (const msg of prevMsgs) {
			seqCounter++;
			feedbackMessages.push({
				seqId: seqCounter,
				role: "context",
				author: msg.sender ?? "Unknown",
				text: msg.text ?? "",
				chainIndex: 0,
			});
		}
	} else if (ui === "imessage") {
		const prevMsgs = (openingState.previousMessages as Array<{ sender?: string; text?: string }>) ?? [];
		for (const msg of prevMsgs) {
			seqCounter++;
			feedbackMessages.push({
				seqId: seqCounter,
				role: "context",
				author: msg.sender ?? "Unknown",
				text: msg.text ?? "",
				chainIndex: 0,
			});
		}
	} else if (ui === "apple_mail") {
		const emails = (openingState.emails as Array<{ from?: string; body?: string; subject?: string }>) ?? [];
		for (const email of emails) {
			seqCounter++;
			feedbackMessages.push({
				seqId: seqCounter,
				role: "context",
				author: email.from ?? "Unknown",
				text: email.subject ? `[${email.subject}] ${email.body ?? ""}` : (email.body ?? ""),
				chainIndex: 0,
			});
		}
	}

	// Add session messages
	for (const msg of messages) {
		if (isHidden(msg)) continue;
		seqCounter++;
		feedbackMessages.push({
			seqId: seqCounter,
			role: msg.role === "user" ? "user" : "agent",
			author: msg.role === "user" ? "You" : "Agent",
			text: getDisplayContent(msg),
			chainIndex: 0,
		});
	}

	return {
		chains: [{ label: "Conversation", messages: feedbackMessages }],
		allMessages: feedbackMessages,
	};
}

// ── Build conversation for feedback ──────────────────────────────────

export function buildFeedbackConversation(messages: SessionMessageRow[], openingState: Record<string, unknown>, ui: UiVariant): FeedbackConversation {
	const isTreeUi = ui === "reddit" || ui === "ao3";

	if (isTreeUi) {
		const tree = buildMessageTree(messages, openingState, ui);
		const chains = flattenTreeToChains(tree);

		// Rebuild with consistent sequential IDs
		let seqCounter = 0;
		const allMessages: FeedbackMessage[] = [];
		const seenUserTexts = new Set<string>();

		for (const chain of chains) {
			for (const msg of chain.messages) {
				// Deduplicate user messages that appear in multiple chains
				const key = `${msg.role}:${msg.text}`;
				if (msg.role === "user" && seenUserTexts.has(key)) {
					// Keep the message in the chain for display but mark with existing seqId
					continue;
				}
				if (msg.role === "user") seenUserTexts.add(key);
				seqCounter++;
				msg.seqId = seqCounter;
				allMessages.push(msg);
			}
		}

		return { chains, allMessages };
	}

	return buildLinearConversation(messages, openingState, ui);
}

// ── Prompt building ──────────────────────────────────────────────────

function buildAnnotationPrompt(conversation: FeedbackConversation, objectives: string[], learningLanguage: string, scenarioContext: string): string {
	// Build conversation text with sequential IDs
	const conversationLines = conversation.allMessages.map((msg) => {
		const roleLabel = msg.role === "user" ? "LEARNER" : msg.role === "agent" ? "PARTNER" : "CONTEXT";
		return `[${msg.seqId}] [${roleLabel}] ${msg.author}: ${msg.text}`;
	});

	const userMessageIds = conversation.allMessages.filter((m) => m.role === "user").map((m) => m.seqId);

	const objectivesSection =
		objectives.length > 0
			? objectives.map((o, i) => `${i + 1}. ${o}`).join("\n")
			: "No specific objectives. Evaluate general conversational fluency, grammar, and appropriateness.";

	return `You are an expert ${learningLanguage} language tutor reviewing a learner's practice conversation.

## Scenario Context
${scenarioContext || "General conversation practice"}

## Full Conversation (with sequential IDs)
${conversationLines.join("\n")}

## Task Objectives
${objectivesSection}

## Instructions

Annotate ONLY the LEARNER messages (IDs: ${userMessageIds.join(", ")}). For each learner message:
1. Reproduce the full message text with inline XML annotation tags:
   - <grammar>...</grammar> for grammar errors (wrong tense, conjugation, agreement, word order)
   - <vocab>...</vocab> for vocabulary issues (wrong word choice, unnatural phrasing)
   - <delete>...</delete> for words/phrases that should be removed
   If a message has no issues, reproduce it without tags.
2. Write a brief comment (1-3 sentences) about that message's quality. In the comment, use <highlight>word</highlight> to tag key vocabulary the learner should remember (not grammar terms, but useful target-language words/phrases worth learning).

Then grade each objective and write a brief overall summary.

## Response Format (XML)

<feedback>
<message id="[sequential_id]">
<annotated>[full message text with inline annotation tags]</annotated>
<comment>[brief tutor comment with optional <highlight> tags for key vocab]</comment>
</message>
... (one <message> block per LEARNER message)
<objectives>
<objective grade="A|B|C">[objective text]</objective>
...
</objectives>
<summary>[2-4 sentence overall performance summary in ${learningLanguage}]</summary>
</feedback>

IMPORTANT:
- The <annotated> text MUST contain the EXACT same words as the original learner message, only adding annotation tags around problematic spans. Do not rephrase or correct the text.
- Write the <summary> in ${learningLanguage.toUpperCase()}.
- Write <comment> sections in English for clarity.
- Grade: A = excellent, B = good with minor issues, C = needs significant improvement.
- If there are no objectives, create one entry: "General conversational fluency" with an appropriate grade.`;
}

// ── Main generation function ─────────────────────────────────────────

export async function generateFeedback(sessionId: number): Promise<FeedbackResult> {
	const session = await db.query.practiceSession.findFirst({
		where: eq(practiceSession.id, sessionId),
		with: {
			messages: { orderBy: asc(sessionMessage.createdAt) },
			task: {
				with: {
					variant: true,
					template: true,
				},
			},
		},
	});

	if (!session) throw new Error("Session not found");
	if (!session.task) throw new Error("Task not found");

	const snapshot = session.agentPromptSnapshot as { systemPrompt: string; scenarioContext?: string; ui?: string };
	const ui = (snapshot.ui ?? session.task.template?.ui ?? "discord") as UiVariant;
	const openingState = (session.task.variant?.openingState as Record<string, unknown>) ?? {};
	const objectives = session.task.objectives ?? [];
	const learningLanguage = getLanguageEnglishName(session.task.language);
	const scenarioContext = snapshot.scenarioContext ?? "";

	const visibleMessages = session.messages.filter((m) => !isHidden(m));
	const conversation = buildFeedbackConversation(visibleMessages, openingState, ui);

	const prompt = buildAnnotationPrompt(conversation, objectives, learningLanguage, scenarioContext);

	const messages: ChatMessage[] = [
		{ role: "system", content: prompt },
		{ role: "user", content: "Please review and annotate this conversation." },
	];

	const response = await chatText({ messages, userId: session.userId, options: { maxTokens: 8192 } });
	const result = parseFeedbackXml(response.content);

	if (!isFeedbackResultValid(result)) {
		throw new Error("LLM returned invalid feedback format");
	}

	// Persist to DB
	await db
		.update(practiceSession)
		.set({
			status: "evaluated",
			tutorFeedback: result,
		})
		.where(eq(practiceSession.id, sessionId));

	return result;
}

/** Get existing feedback from DB, or null if not yet generated */
export async function getExistingFeedback(sessionId: number): Promise<FeedbackResult | null> {
	const session = await db.query.practiceSession.findFirst({
		where: eq(practiceSession.id, sessionId),
		columns: { tutorFeedback: true, status: true },
	});

	if (!session) return null;
	if (session.status !== "evaluated" || !session.tutorFeedback) return null;

	// Validate it's the new format (has 'annotations' field)
	const feedback = session.tutorFeedback as unknown;
	if (feedback && typeof feedback === "object" && "annotations" in (feedback as object)) {
		return feedback as FeedbackResult;
	}

	return null;
}

// ── Follow-up on feedback items ──────────────────────────────────────

const FollowUpAnswerSchema = z.object({
	answer: z.string().describe("A helpful, concise explanation answering the learner's follow-up question."),
});

const FOLLOWUP_PRESET_PROMPTS: Record<string, string> = {
	why: "Why is this wrong? Please explain the underlying rule or principle.",
	examples: "Give me 3 more natural examples that illustrate the correct usage.",
};

export type FollowUpOnFeedbackInput = {
	sessionId: number;
	userId: string;
	itemText: string;
	category: "grammar" | "vocabulary" | "coherence";
	question: string;
};

export type FollowUpOnFeedbackResult = {
	answer: string;
};

export async function followUpOnFeedback(input: FollowUpOnFeedbackInput): Promise<FollowUpOnFeedbackResult> {
	const session = await db.query.practiceSession.findFirst({
		where: and(eq(practiceSession.id, input.sessionId), eq(practiceSession.userId, input.userId)),
		with: { task: { columns: { language: true } } },
	});

	if (!session) throw new Error("Session not found");

	const learningLanguageName = getLanguageEnglishName(session.task?.language ?? "en");
	const resolvedQuestion = FOLLOWUP_PRESET_PROMPTS[input.question] ?? input.question;
	const categoryLabel = { grammar: "Grammar", vocabulary: "Vocabulary", coherence: "Coherence" }[input.category];

	const systemPrompt = `You are an expert ${learningLanguageName} language tutor. A learner has just received feedback on their ${learningLanguageName} practice and wants to understand a specific issue better.

The note they're asking about:
- Category: ${categoryLabel}
- Knowledge point: "${input.itemText}"

Their follow-up question: ${resolvedQuestion}

## Instructions
- Answer in a helpful, encouraging tone suitable for a language learner.
- Be concise but thorough — 2-5 sentences is usually enough unless the learner asks for examples (then include 3 brief examples).
- If the knowledge point describes a mistake, explain the correct rule clearly.
- If the learner asks for examples, provide natural ${learningLanguageName} examples with brief English explanations.
- Write your entire answer in English (the examples can mix ${learningLanguageName} and English).
- Do NOT roleplay as a character — you are a tutor, not the scenario persona.

Respond in JSON format: { "answer": "your response here" }`;

	const messages: ChatMessage[] = [
		{ role: "system", content: systemPrompt },
		{ role: "user", content: resolvedQuestion },
	];

	const result = await chatJson(FollowUpAnswerSchema, { messages, userId: input.userId });
	return { answer: result.answer };
}
