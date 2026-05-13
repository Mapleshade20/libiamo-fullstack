export type ObjectiveResult = {
	text: string;
	grade: "A" | "B" | "C";
};

export type TutorFeedback = {
	content: string;
	objectiveResults: ObjectiveResult[];
};
