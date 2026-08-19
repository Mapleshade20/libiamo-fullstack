import type { UiVariant, Urgency } from "$lib/constants";

export type AsyncReplyDemoTask = {
	id: string;
	title: string;
	ui: UiVariant;
	urgency: Urgency;
	maxTurns: number;
	systemPrompt: string;
	seedMessages: Array<{ id: number; role: "user" | "assistant"; content: string }>;
};

export const ASYNC_REPLY_DEMO_TASKS: AsyncReplyDemoTask[] = [
	{
		id: "discord-planning",
		title: "Discord · Weekend planning",
		ui: "discord",
		urgency: "medium",
		maxTurns: 4,
		systemPrompt: "You are Sam in a small friends' Discord. Coordinate a weekend plan naturally, without acting like a tutor.",
		seedMessages: [{ id: 1, role: "user", content: "Are you free on Saturday? We could finally try that new café." }],
	},
	{
		id: "reddit-advice",
		title: "Reddit · Advice thread",
		ui: "reddit",
		urgency: "high",
		maxTurns: 3,
		systemPrompt: "You are a thoughtful Reddit commenter replying in an advice thread. Be candid, specific, and human.",
		seedMessages: [{ id: 101, role: "user", content: "How do I politely tell my flatmate that late-night calls keep waking me up?" }],
	},
];

export function wouldReachDemoMaxTurns(task: AsyncReplyDemoTask, messages: Array<{ role: string }>): boolean {
	return messages.filter((message) => message.role === "user").length >= task.maxTurns;
}
