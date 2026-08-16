/**
 * Server-side feedback generation.
 * Builds the annotation prompt, calls LLM, parses XML, persists result.
 */

import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { getLanguageEnglishName, type UiVariant } from "$lib/constants";
import type {
	AnnotationKind,
	AnnotationSpan,
	FeedbackChain,
	FeedbackConversation,
	FeedbackMessage,
	FeedbackResult,
	MessageAnnotation,
	ObjectiveGrade,
} from "$lib/feedback/types";
import { db } from "./db";
import { practiceSession } from "./db/schema";
import { type ChatMessage, chatJson, chatText } from "./llm";
import { sessionMessageChronologicalOrder } from "./session";

// ── XML extraction helpers ───────────────────────────────────────────

function extractTagContent(xml: string, tag: string): string | null {
	const openTag = `<${tag}`;
	const closeTag = `</${tag}>`;
	const startIdx = xml.indexOf(openTag);
	if (startIdx === -1) return null;

	// Find the end of the opening tag (handle attributes)
	const tagEndIdx = xml.indexOf(">", startIdx + openTag.length);
	if (tagEndIdx === -1) return null;

	const contentStart = tagEndIdx + 1;
	const endIdx = xml.indexOf(closeTag, contentStart);
	if (endIdx === -1) return null;

	return xml.slice(contentStart, endIdx);
}

function extractAllTagsWithAttr(xml: string, tag: string): Array<{ attrs: Record<string, string>; content: string }> {
	const results: Array<{ attrs: Record<string, string>; content: string }> = [];
	const openTag = `<${tag}`;
	const closeTag = `</${tag}>`;
	let searchFrom = 0;

	while (true) {
		const startIdx = xml.indexOf(openTag, searchFrom);
		if (startIdx === -1) break;

		const tagEndIdx = xml.indexOf(">", startIdx + openTag.length);
		if (tagEndIdx === -1) break;

		// Parse attributes
		const attrStr = xml.slice(startIdx + openTag.length, tagEndIdx).trim();
		const attrs: Record<string, string> = {};
		// Parse key="value" pairs — split on whitespace to avoid \s* in regex (SonarQube S5852)
		for (const token of attrStr.split(/\s+/)) {
			const eq = token.indexOf("=");
			if (eq === -1) continue;
			const key = token.slice(0, eq);
			const value = token.slice(eq + 1).replace(/^"|"$/g, "");
			if (key) attrs[key] = value;
		}

		const contentStart = tagEndIdx + 1;
		const endIdx = xml.indexOf(closeTag, contentStart);
		if (endIdx === -1) break;

		results.push({ attrs, content: xml.slice(contentStart, endIdx) });
		searchFrom = endIdx + closeTag.length;
	}

	return results;
}

// ── Annotation span parsing ──────────────────────────────────────────

export function parseAnnotationSpans(annotatedText: string): AnnotationSpan[] {
	const spans: AnnotationSpan[] = [];
	const tagPattern = /<(grammar|vocab|delete)>([\s\S]*?)<\/\1>/g;
	let match: RegExpExecArray | null;

	// We need to track position in the "plain text" version
	let plainOffset = 0;
	let lastIndex = 0;

	while ((match = tagPattern.exec(annotatedText)) !== null) {
		// Add the plain text before this tag
		const textBefore = annotatedText.slice(lastIndex, match.index);
		plainOffset += stripAllTags(textBefore).length;

		const kind = match[1] as AnnotationKind;
		const innerText = match[2];
		const plainInner = stripAllTags(innerText);

		spans.push({
			kind,
			text: plainInner,
			startOffset: plainOffset,
		});

		plainOffset += plainInner.length;
		lastIndex = match.index + match[0].length;
	}

	return spans;
}

/** Strip all XML-like tags from text, leaving only content */
export function stripAllTags(text: string): string {
	return text.replace(/<\/?(?:grammar|vocab|delete|mark)>/g, "");
}

/** Get plain text from annotated text (for display comparison) */
export function getPlainText(annotatedText: string): string {
	return stripAllTags(annotatedText);
}

// ── Main parser ──────────────────────────────────────────────────────

export function parseFeedbackXml(xmlResponse: string): FeedbackResult {
	// Guard against oversized input: LLM response is bounded by maxTokens (32768),
	// but a hard size cap provides defense-in-depth against ReDoS on the tag regex.
	const MAX_XML_LENGTH = 100_000;
	if (xmlResponse.length > MAX_XML_LENGTH) {
		throw new Error(`Feedback XML too large: ${xmlResponse.length} bytes (max ${MAX_XML_LENGTH})`);
	}

	// Strip markdown fences if present
	let xml = xmlResponse.trim();
	if (/^```(?:xml)?/i.test(xml)) {
		xml = xml.replace(/^```(?:xml)?/i, "").trim();
	}
	if (xml.endsWith("```")) {
		xml = xml.slice(0, -3).trimEnd();
	}

	// Extract feedback content (may or may not have wrapper)
	const feedbackContent = extractTagContent(xml, "feedback") ?? xml;

	// Parse message annotations
	const messageBlocks = extractAllTagsWithAttr(feedbackContent, "message");
	const annotations: MessageAnnotation[] = messageBlocks.map((block) => {
		const messageId = Number.parseInt(block.attrs.id ?? "0", 10);
		const annotatedText = extractTagContent(block.content, "annotated")?.trim() ?? "";
		const comment = extractTagContent(block.content, "comment")?.trim() ?? "";
		const spans = parseAnnotationSpans(annotatedText);

		return {
			messageId,
			annotatedText,
			spans,
			comment,
		};
	});

	// Parse objectives
	const objectivesBlock = extractTagContent(feedbackContent, "objectives") ?? "";
	const objectiveEntries = extractAllTagsWithAttr(objectivesBlock, "objective");
	const objectives: ObjectiveGrade[] = objectiveEntries.map((entry) => ({
		text: entry.content.trim(),
		grade: (entry.attrs.grade?.toUpperCase() ?? "C") as "A" | "B" | "C",
	}));

	// Parse summary
	const summary = extractTagContent(feedbackContent, "summary")?.trim() ?? "";

	return { feedbackLanguage: "", annotations, objectives, summary };
}

// ── Validation ───────────────────────────────────────────────────────

export function isFeedbackResultValid(result: FeedbackResult): boolean {
	return result.annotations.length > 0 && result.summary.length > 0;
}

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

export function buildAnnotationPrompt(input: {
	conversation: FeedbackConversation;
	objectives: string[];
	learningLanguage: string;
	feedbackLanguage: string;
	scenarioContext: string;
}): string {
	const { conversation, objectives, scenarioContext } = input;
	const learningLanguage = getLanguageEnglishName(input.learningLanguage);
	const feedbackLanguage = getLanguageEnglishName(input.feedbackLanguage);
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
2. Write a brief ${feedbackLanguage} comment (1-3 sentences) about that message's quality. In the comment, use <mark>word</mark> to tag useful ${learningLanguage} words or phrases the learner should remember. Keep marked vocabulary in ${learningLanguage}; write the surrounding explanation in ${feedbackLanguage}.

Then grade each objective. Express each objective's learner-facing text in ${feedbackLanguage}, preserving its meaning. Write the overall summary in ${feedbackLanguage}.

## Response Format (XML)

<feedback>
<message id="[sequential_id]">
<annotated>[full message text with inline annotation tags]</annotated>
<comment>[brief ${feedbackLanguage} tutor comment with optional <mark> tags around ${learningLanguage} vocabulary]</comment>
</message>
... (one <message> block per LEARNER message)
<objectives>
<objective grade="A|B|C">[objective text]</objective>
...
</objectives>
<summary>[2-4 sentence overall performance summary in ${feedbackLanguage}]</summary>
</feedback>

IMPORTANT:
- The <annotated> text MUST contain the EXACT same words as the original learner message, only adding annotation tags around problematic spans. Do not rephrase or correct the text.
- Write every <comment>, objective text, and <summary> entirely in ${feedbackLanguage}, except for quoted ${learningLanguage} examples and marked vocabulary.
- Grade: A = excellent, B = good with minor issues, C = needs significant improvement.
- If there are no objectives, create one appropriately graded general-fluency objective written in ${feedbackLanguage}.`;
}

// ── Main generation function ─────────────────────────────────────────

export async function generateFeedback(input: { sessionId: number; feedbackLanguage: string }): Promise<FeedbackResult> {
	if (!input.feedbackLanguage.trim()) throw new Error("Feedback language is required");
	const session = await db.query.practiceSession.findFirst({
		where: eq(practiceSession.id, input.sessionId),
		columns: { id: true, userId: true, status: true, tutorFeedback: true, agentPromptSnapshot: true },
		with: {
			messages: { orderBy: sessionMessageChronologicalOrder },
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
	if (session.status === "evaluated" && session.tutorFeedback) {
		const existing = session.tutorFeedback as unknown;
		if (existing && typeof existing === "object" && "annotations" in existing) return existing as FeedbackResult;
	}
	if (session.status !== "completed") throw new Error("Session is not ready for feedback");

	const snapshot = session.agentPromptSnapshot as { systemPrompt: string; scenarioContext?: string; ui?: string };
	const ui = (snapshot.ui ?? session.task.template?.ui ?? "discord") as UiVariant;
	const openingState = (session.task.variant?.openingState as Record<string, unknown>) ?? {};
	const objectives = session.task.objectives ?? [];
	const scenarioContext = snapshot.scenarioContext ?? "";

	const visibleMessages = session.messages.filter((m) => !isHidden(m));
	const conversation = buildFeedbackConversation(visibleMessages, openingState, ui);

	const prompt = buildAnnotationPrompt({
		conversation,
		objectives,
		learningLanguage: session.task.language,
		feedbackLanguage: input.feedbackLanguage,
		scenarioContext,
	});

	const messages: ChatMessage[] = [
		{ role: "system", content: prompt },
		{ role: "user", content: "Please review and annotate this conversation." },
	];

	const response = await chatText({ messages, userId: session.userId, options: { maxTokens: 32_768 } });
	const result = { ...parseFeedbackXml(response.content), feedbackLanguage: input.feedbackLanguage };

	if (!isFeedbackResultValid(result)) {
		throw new Error("LLM returned invalid feedback format");
	}

	// Persist to DB
	const [updated] = await db
		.update(practiceSession)
		.set({
			status: "evaluated",
			tutorFeedback: result,
		})
		.where(and(eq(practiceSession.id, input.sessionId), eq(practiceSession.status, "completed"), isNull(practiceSession.tutorFeedback)))
		.returning({ id: practiceSession.id });

	if (!updated) {
		const winner = await getExistingFeedback(input.sessionId);
		if (winner) return winner;
		throw new Error("Feedback generation changed in another request. Reload and try again.");
	}

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

const FollowUpAnswerSchema = z
	.object({
		answer: z.string().trim().min(1).describe("A helpful, concise explanation answering the learner's follow-up question."),
	})
	.strict();

const FOLLOWUP_PRESET_PROMPTS: Record<string, string> = {
	why: "Why is this wrong? Please explain the underlying rule or principle.",
	examples: "Give me 3 more natural examples that illustrate the correct usage.",
};

type FollowUpOnFeedbackInput = {
	sessionId: number;
	userId: string;
	feedbackLanguage: string;
	itemText: string;
	category: "grammar" | "vocabulary" | "coherence";
	question: string;
	currentContext?: string;
	previousContext?: string;
	explanationMode?: "issue" | "good_expression";
};

type FollowUpOnFeedbackResult = {
	answer: string;
};

export async function followUpOnLearningContent(input: {
	userId: string;
	learningLanguage: string;
	feedbackLanguage: string;
	itemText: string;
	category: "grammar" | "vocabulary" | "coherence";
	question: string;
	currentContext?: string;
	previousContext?: string;
	explanationMode?: "issue" | "good_expression";
}): Promise<FollowUpOnFeedbackResult> {
	if (!input.learningLanguage.trim() || !input.feedbackLanguage.trim()) {
		throw new Error("Learning and feedback languages are required");
	}
	const learningLanguageName = getLanguageEnglishName(input.learningLanguage);
	const feedbackLanguageName = getLanguageEnglishName(input.feedbackLanguage);
	const resolvedQuestion = FOLLOWUP_PRESET_PROMPTS[input.question] ?? input.question;
	const categoryLabel = { grammar: "Grammar", vocabulary: "Vocabulary", coherence: "Coherence" }[input.category];
	const explanationMode = input.explanationMode ?? "issue";
	const contextSection = [
		input.previousContext?.trim() ? `Previous visible message/context:\n${input.previousContext.trim()}` : "",
		input.currentContext?.trim() ? `Original current message/comment context:\n${input.currentContext.trim()}` : "",
	]
		.filter(Boolean)
		.join("\n\n");
	const focusLabel = explanationMode === "good_expression" ? "Good expression" : "Feedback issue";
	const modeInstructions =
		explanationMode === "good_expression"
			? `- Treat the selected text as a good/natural expression worth learning, not as a mistake.\n- Explain what it means, why it is useful or natural in this context, and how the learner can reuse it.\n- If examples are useful, provide natural ${learningLanguageName} examples with brief ${feedbackLanguageName} explanations.`
			: `- Treat the selected text as an issue from the learner's message unless the context clearly says otherwise.\n- Explain what is wrong or unnatural and give the correct rule, wording, or more natural alternative.\n- If the learner asks for examples, provide natural ${learningLanguageName} examples with brief ${feedbackLanguageName} explanations.`;

	const systemPrompt = `You are an expert ${learningLanguageName} language tutor. A learner has just received feedback on their ${learningLanguageName} practice and wants to understand a specific item better.

The item they're asking about:
- Type: ${focusLabel}
- Category: ${categoryLabel}
- Selected text: "${input.itemText}"
${contextSection ? `\n## Original Context\n${contextSection}\n` : ""}
Their follow-up question: ${resolvedQuestion}

## Instructions
- Answer in a helpful, encouraging tone suitable for a language learner.
- Be concise but thorough — 2-5 sentences is usually enough unless examples are requested.
${modeInstructions}
- Use the original context above to explain the item specifically, not generically.
- Write your entire answer in ${feedbackLanguageName} (examples may mix ${learningLanguageName} and ${feedbackLanguageName}).
- Do NOT roleplay as a character — you are a tutor, not the scenario persona.

Respond in JSON format: { "answer": "your response here" }`;

	const messages: ChatMessage[] = [
		{ role: "system", content: systemPrompt },
		{ role: "user", content: resolvedQuestion },
	];

	const { value } = await chatJson({ schema: FollowUpAnswerSchema, messages, userId: input.userId });
	return { answer: value.answer };
}

export async function followUpOnFeedback(input: FollowUpOnFeedbackInput): Promise<FollowUpOnFeedbackResult> {
	const session = await db.query.practiceSession.findFirst({
		where: and(eq(practiceSession.id, input.sessionId), eq(practiceSession.userId, input.userId)),
		with: { task: { columns: { language: true } } },
	});

	if (!session) throw new Error("Session not found");

	return followUpOnLearningContent({
		...input,
		learningLanguage: session.task?.language ?? "en",
	});
}
