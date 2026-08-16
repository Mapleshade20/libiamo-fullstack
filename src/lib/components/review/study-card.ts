export type StudyCardActionTone = "again" | "hard" | "good" | "easy";

export type StudyCardAction = {
	id: string;
	label: string;
	detail?: string;
	shortcut?: string;
	tone: StudyCardActionTone;
};
