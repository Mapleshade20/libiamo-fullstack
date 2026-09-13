export type WelcomeFeedbackPart = { type: "text"; content: string } | { type: "mark"; content: string; annotation: "01" | "02" | "03" };

export const WELCOME_TRANSLATION_CASE = {
	title: "Man is born free",
	attribution: "Jean-Jacques Rousseau · The Social Contract, Book I, Chapter I",
	platform: "Chinese → English",
	scope: "1 sentence",
	source: "人生而自由，却无往不在枷锁之中。",
	firstDraft: "People are born free, but everywhere they live under restraints.",
	firstDraftParts: [
		{ type: "mark", content: "People", annotation: "01" },
		{ type: "text", content: " are born free, " },
		{ type: "mark", content: "but", annotation: "02" },
		{ type: "text", content: " everywhere they " },
		{ type: "mark", content: "live under restraints", annotation: "03" },
		{ type: "text", content: "." },
	] satisfies WelcomeFeedbackPart[],
	referenceRevision: "Man is born free, and everywhere he is in chains.",
	referenceParts: [
		{ type: "mark", content: "Man", annotation: "01" },
		{ type: "text", content: " is born free, " },
		{ type: "mark", content: "and", annotation: "02" },
		{ type: "text", content: " everywhere he " },
		{ type: "mark", content: "is in chains", annotation: "03" },
		{ type: "text", content: "." },
	] satisfies WelcomeFeedbackPart[],
	annotations: [
		{ id: "01", label: "subject", note: "Preserve the aphorism’s singular, universal subject." },
		{ id: "02", label: "connection", note: "The established wording joins freedom and constraint with “and.”" },
		{ id: "03", label: "idiom", note: "Use “in chains” for the compact metaphor, rather than a literal paraphrase." },
	],
	ratings: {
		accuracy: "A",
		naturalness: "B",
		overall: "B",
	},
	reviewNote: {
		vocab: "in chains",
		targetDefinition: "restricted or deprived of freedom, literally or figuratively",
		nativeDefinition: "身陷枷锁；受到束缚",
		examples: [
			{ nativeText: "人民仍处在暴政的枷锁之下。", targetText: "The people remained in chains under tyranny." },
			{ nativeText: "他获释前曾多年身陷囹圄。", targetText: "He spent years in chains before his release." },
			{ nativeText: "债务让这个家庭处处受限。", targetText: "Debt kept the family in chains." },
			{ nativeText: "这些规则使创造力受到束缚。", targetText: "These rules leave creativity in chains." },
		],
	},
} as const;
