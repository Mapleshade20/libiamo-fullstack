export type ObjectiveResult = {
	text: string;
	grade: "A" | "B" | "C";
};

export type TutorFeedback = {
	objectiveResults: ObjectiveResult[];
	grammar: string[];
	vocabulary: string[];
	coherence: string[];
	summary: string;
};
