export type LearningSelection = {
	text: string;
	currentContext: string;
	previousContext: string;
	sourceKind: string;
};

export type SelectionAppendRequest = {
	id: number;
	selection: LearningSelection;
};

export type SaveSelectionResult = {
	count: number;
	reason?: string | null;
};
