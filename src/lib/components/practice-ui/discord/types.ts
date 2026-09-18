import type { PracticeOpeningState } from "../types";
import type { i18n } from "./i18n";

export type ChatUser = { id: string; name: string; status: string; color: string; isAgent: boolean };
export type DiscordLabels = { [Key in keyof typeof i18n.en]: string };

export type ChatOpeningState = PracticeOpeningState & {
	serverName?: string;
	channelName?: string;
};
