/** Opening-state types and the empty state each chat interface starts from in the task editor. */

import type { z } from "zod";
import type { ChatUiVariant } from "$lib/constants";
import type {
	ao3OpeningStateSchema,
	appleMailOpeningStateSchema,
	discordOpeningStateSchema,
	imessageOpeningStateSchema,
	redditOpeningStateSchema,
} from "$lib/schemas";

// ── Types ────────────────────────────────────────────────────────────

type IMessageState = z.infer<typeof imessageOpeningStateSchema>;
type DiscordState = z.infer<typeof discordOpeningStateSchema>;
type RedditState = z.infer<typeof redditOpeningStateSchema>;
type AppleMailState = z.infer<typeof appleMailOpeningStateSchema>;
type Ao3State = z.infer<typeof ao3OpeningStateSchema>;

export type OpeningState = IMessageState | DiscordState | RedditState | AppleMailState | Ao3State;

// ── Opening State Defaults ───────────────────────────────────────────

export function getDefaultOpeningState(ui: ChatUiVariant): OpeningState {
	switch (ui) {
		case "imessage":
			return { previousMessages: [] };
		case "discord":
			return { serverName: "", channelName: "", previousMessages: [] };
		case "reddit":
			return {
				post: { title: "", body: "", subreddit: "", author: "" },
				previousComments: [],
			};
		case "apple_mail":
			return { emails: [] };
		case "ao3":
			return {
				workTitle: "",
				authorName: "",
				chapterTitle: "",
				summary: "",
				bodyExcerpt: "",
				rating: "Teen And Up Audiences",
				archiveWarning: "No Archive Warnings Apply",
				categories: [],
				fandoms: [],
				relationships: [],
				characters: [],
				additionalTags: [],
				tags: [],
				stats: {},
				previousComments: [],
			};
	}
}
