import type { PracticeOpeningState, PracticeParticipant } from "../types";

export type ChatUser = PracticeParticipant;

export type ChatOpeningState = PracticeOpeningState & {
	serverName?: string;
	channelName?: string;
};
