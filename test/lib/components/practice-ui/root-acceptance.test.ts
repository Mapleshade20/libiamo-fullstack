import { render } from "svelte/server";
import { describe, expect, it, vi } from "vitest";
import AO3UI from "$lib/components/practice-ui/ao3/AO3UI.svelte";
import DiscordUI from "$lib/components/practice-ui/discord/DiscordUI.svelte";
import IMessageUI from "$lib/components/practice-ui/imessage/IMessageUI.svelte";
import MailUI from "$lib/components/practice-ui/mail/MailUI.svelte";
import RedditUI from "$lib/components/practice-ui/reddit/RedditUI.svelte";

vi.mock("$app/paths", () => ({ base: "" }));

const components = [
	["Discord", DiscordUI, { serverName: "Study Hall", channelName: "general" }, /<textarea/],
	["iMessage", IMessageUI, { contactName: "Alex Morgan", previousMessages: [] }, /<textarea/],
	["Mail", MailUI, { emails: [] }, /New Message/],
	[
		"Reddit",
		RedditUI,
		{ post: { title: "A question", body: "A post", subreddit: "Ask", author: "u/author" }, previousComments: [] },
		/role="button"/,
	],
	["AO3", AO3UI, { workTitle: "A work", authorName: "archive_author", previousComments: [] }, /<textarea/],
] as const;

const existingSession = {
	id: 17,
	status: "in_progress" as const,
	messages: [
		{
			id: 1,
			role: "assistant" as const,
			content: "Existing persisted reply",
			createdAt: new Date("2026-09-19T00:00:00.000Z"),
			llmMetadata: null,
		},
	],
	agentReadUpToMessageId: null,
	maxTurnsSnapshot: 5,
	nextAgentWorkDueAt: null,
	tutorFeedback: null,
};

function props(openingState: unknown) {
	return {
		taskId: "acceptance-task",
		userName: "Learner",
		avatarUrl: "learner.png",
		language: "en" as const,
		existingSession,
		openingState,
		maxTurns: 5,
		returnHref: "/",
		feedbackHref: "/task/acceptance-task/feedback",
	};
}

describe("practice UI root acceptance", () => {
	it.each(components)("renders %s with persisted content and an editor entry point", (_name, Component, openingState, editorPattern) => {
		const { body } = render(Component, { props: props(openingState) });

		expect(body).toContain("Existing persisted reply");
		expect(body).toMatch(editorPattern);
	});
});
