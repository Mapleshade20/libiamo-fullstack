export type ObjectiveResult = {
	text: string;
	grade: "A" | "B" | "C";
};

export type TutorFeedback = {
	content: string;
	objectiveResults: ObjectiveResult[];
};

export type DiscordUser = {
	id: string;
	name: string;
	status: string;
	color: string;
	isAgent: boolean;
};

export type DiscordOpeningState = {
	serverName?: string;
	channelName?: string;
	previousMessages?: Array<{
		sender?: string;
		author?: string;
		text?: string;
		content?: string;
	}>;
};
