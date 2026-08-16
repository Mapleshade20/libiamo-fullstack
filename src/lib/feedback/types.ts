/**
 * Types for the feedback/annotation system.
 * The LLM produces XML-formatted annotations on user messages,
 * per-message comments, objective grading, and a summary.
 */

// ── Annotation spans within a user message ───────────────────────────

export type AnnotationKind = "grammar" | "vocab" | "delete";

export type AnnotationSpan = {
	kind: AnnotationKind;
	text: string;
	/** Character offset in the original message text (for alignment verification) */
	startOffset?: number;
};

// ── Per-message annotation result ────────────────────────────────────

export type MessageAnnotation = {
	/** Sequential message ID (1-based, matches prompt numbering) */
	messageId: number;
	/** The full annotated text with inline XML tags preserved for rendering */
	annotatedText: string;
	/** Parsed annotation spans for interaction */
	spans: AnnotationSpan[];
	/** Tutor comment for this message (may contain semantic <mark> tags) */
	comment: string;
};

// ── Objective grading ────────────────────────────────────────────────

export type ObjectiveGrade = {
	text: string;
	grade: "A" | "B" | "C";
};

// ── Complete feedback result ─────────────────────────────────────────

export type FeedbackResult = {
	/** Concrete language resolved and frozen when this feedback was generated. */
	feedbackLanguage: string;
	annotations: MessageAnnotation[];
	objectives: ObjectiveGrade[];
	summary: string;
};

// ── Chain structure for tree-based UIs (Reddit/AO3) ──────────────────

export type FeedbackMessage = {
	/** Sequential ID for LLM prompt (1-based) */
	seqId: number;
	role: "user" | "agent" | "context";
	author: string;
	text: string;
	/** Which chain this message belongs to (0-based) */
	chainIndex: number;
};

export type FeedbackChain = {
	/** Chain label (e.g., "Thread 1", "Thread 2") */
	label: string;
	messages: FeedbackMessage[];
};

export type FeedbackConversation = {
	chains: FeedbackChain[];
	/** All messages in display order (flattened from chains) */
	allMessages: FeedbackMessage[];
};
