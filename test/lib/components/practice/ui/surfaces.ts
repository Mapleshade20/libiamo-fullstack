import { flushSync } from "svelte";
import type { PracticeSurfaceProps } from "$lib/components/practice/session/session.svelte";
import AO3UI from "$lib/components/practice/ui/ao3/AO3UI.svelte";
import DiscordUI from "$lib/components/practice/ui/discord/DiscordUI.svelte";
import IMessageUI from "$lib/components/practice/ui/imessage/IMessageUI.svelte";
import MailUI from "$lib/components/practice/ui/mail/MailUI.svelte";
import RedditUI from "$lib/components/practice/ui/reddit/RedditUI.svelte";
import type { PersistedPracticeMessage } from "$lib/practice/messages";

type Persisted = (id: number, role: "user" | "assistant", content: string, llmMetadata?: unknown) => PersistedPracticeMessage;

export type SurfaceCase = {
	name: string;
	component: any;
	openingState: PracticeSurfaceProps["openingState"];
	/** A learner turn and the counterpart's answer, stored the way this surface stores them. */
	history: (persisted: Persisted) => PersistedPracticeMessage[];
	/** Texts that must be visible for that history. */
	visible: string[];
	/** Writes `text` into the surface's composer and submits it. */
	compose: (root: HTMLElement, text: string) => Promise<void>;
	/** What the learner's submission is stored as. */
	sent: (text: string) => string;
};

function field(root: ParentNode, selector: string) {
	const element = root.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector);
	if (!element) throw new Error(`missing ${selector}`);
	return element;
}

export function type(root: ParentNode, selector: string, value: string) {
	const element = field(root, selector);
	element.value = value;
	element.dispatchEvent(new Event("input", { bubbles: true }));
	flushSync();
}

export function button(root: ParentNode, name: string): HTMLButtonElement {
	const buttons = [...root.querySelectorAll<HTMLButtonElement>("button")];
	const match =
		buttons.find((candidate) => candidate.getAttribute("aria-label") === name || candidate.textContent?.trim() === name) ??
		buttons.find((candidate) => candidate.textContent?.trim().endsWith(name));
	if (!match) throw new Error(`missing button ${name}`);
	return match;
}

const thread = (ui: string, owner: string) => ({
	user: { clientMessageId: "c1", thread: { commentId: `${ui}-user-c1`, targetCommentId: null, responderName: owner, mode: "reply" } },
	agent: { clientMessageId: "c1", thread: { commentId: `${ui}-agent-c1`, parentCommentId: `${ui}-user-c1`, responderName: owner } },
});

export const SURFACES: SurfaceCase[] = [
	{
		name: "Discord",
		component: DiscordUI,
		openingState: { serverName: "Speedrunners", channelName: "general", previousMessages: [{ sender: "Roddy", text: "anyone around?" }] },
		history: (p) => [p(1, "user", "hi everyone", { clientMessageId: "c1" }), p(2, "assistant", "welcome aboard", { clientMessageId: "c1" })],
		visible: ["anyone around?", "hi everyone", "welcome aboard", "Speedrunners"],
		async compose(root, text) {
			type(root, "textarea", text);
			button(root, "Send").click();
		},
		sent: (text) => text,
	},
	{
		name: "iMessage",
		component: IMessageUI,
		openingState: { previousMessages: [{ sender: "Alex", text: "any plans this weekend?" }] },
		history: (p) => [p(1, "user", "hiking maybe", { clientMessageId: "c1" }), p(2, "assistant", "love that", { clientMessageId: "c1" })],
		visible: ["any plans this weekend?", "hiking maybe", "love that", "Alex"],
		async compose(root, text) {
			type(root, "textarea", text);
			button(root, "Send").click();
		},
		sent: (text) => text,
	},
	{
		name: "Mail",
		component: MailUI,
		openingState: { emails: [{ from: "Maya Chen <maya@x.example>", to: "Learner", subject: "Dinner?", body: "Free on Friday?" }] },
		history: (p) => [
			p(1, "user", "To: Maya Chen <maya@x.example>\nSubject: Re: Dinner?\n\nFriday works.", { clientMessageId: "c1" }),
			p(2, "assistant", "Great, 7pm then.", { clientMessageId: "c1" }),
		],
		visible: ["Great, 7pm then.", "Re: Dinner?", "Maya Chen"],
		async compose(root, text) {
			button(root, "New Message").click();
			flushSync();
			type(document, "[role=dialog] input", "Plans");
			type(document, "[role=dialog] textarea", text);
			button(document.querySelector("[role=dialog]") as HTMLElement, "Send").click();
		},
		sent: (text) => `To: Maya Chen <maya@x.example>\nSubject: Plans\n\n${text}`,
	},
	{
		name: "Reddit",
		component: RedditUI,
		openingState: { post: { title: "Best trail?", body: "Looking for tips", subreddit: "hiking", author: "OP" } },
		history: (p) => [
			p(1, "user", "Try the ridge trail", thread("reddit", "OP").user),
			p(2, "assistant", "Thanks, will do", thread("reddit", "OP").agent),
		],
		visible: ["Best trail?", "Try the ridge trail", "Thanks, will do"],
		async compose(root, text) {
			button(root, "What are your thoughts?").click();
			flushSync();
			type(root, "textarea", text);
			button(root, "Post Comment").click();
		},
		sent: (text) => text,
	},
	{
		name: "AO3",
		component: AO3UI,
		openingState: { workTitle: "Paths of Remnant", authorName: "Hikari", bodyExcerpt: "Chapter text" },
		history: (p) => [
			p(1, "user", "Loved this chapter", thread("ao3", "Hikari").user),
			p(2, "assistant", "Thank you for reading!", thread("ao3", "Hikari").agent),
		],
		visible: ["Paths of Remnant", "Loved this chapter", "Thank you for reading!"],
		async compose(root, text) {
			type(root, "textarea", text);
			button(root, "Comment").click();
		},
		sent: (text) => text,
	},
];
