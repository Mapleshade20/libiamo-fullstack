import { beforeEach, describe, expect, it, vi } from "vitest";

const { getUserOpenAIConfig } = vi.hoisted(() => ({ getUserOpenAIConfig: vi.fn() }));
vi.mock("$lib/server/llm/client", () => ({ getUserOpenAIConfig }));

import { resolveScene } from "$lib/practice/scene";
import { inferAddressees, needsAddressee, readAddressees } from "$lib/server/practice/addressee/infer";
import type { TranscriptEntry } from "$lib/server/practice/prompt-context";

const openingState = {
	channelName: "general",
	previousMessages: [
		{ sender: "rin", text: "anyone tried the new ramen place?" },
		{ sender: "kai", text: "my build finally compiles" },
		{ sender: "theo", text: "gg" },
	],
};
const channel = resolveScene("discord", openingState, 1, "Maple");
const learner = (text: string, replyTo?: number): TranscriptEntry => ({
	id: 4,
	role: "learner",
	author: "Maple",
	text,
	...(replyTo ? { replyTo } : {}),
});
const history = [{ id: 1, role: "user", content: "yes, the broth is amazing" }];
const task = { id: 1, ui: "discord" as const, openingState };

describe("addressee inference", () => {
	beforeEach(() => {
		getUserOpenAIConfig.mockReset();
		vi.spyOn(console, "warn").mockImplementation(() => {});
	});

	it("is needed only for unmarked messages in group chats", () => {
		expect(needsAddressee("discord", channel, [learner("yes!")])).toBe(true);
		expect(needsAddressee("discord", channel, [learner("yes!", 1)])).toBe(false);
		expect(needsAddressee("discord", channel, [learner("@rin yes!")])).toBe(false);
		const dm = resolveScene("discord", { dm: true, counterpartName: "rin" }, 1, "Maple");
		expect(needsAddressee("discord", dm, [learner("yes!")])).toBe(false);
		const thread = resolveScene("reddit", { post: { author: "op" }, previousComments: [{ author: "a", text: "x" }] }, 1, "Maple");
		expect(needsAddressee("reddit", thread, [learner("yes!")])).toBe(false);
	});

	it("reads a person, nobody in particular, or nothing usable", () => {
		expect(readAddressees({ choice: "p1", probabilities: {} }, ["rin", "kai"])).toEqual(["kai"]);
		expect(readAddressees({ choice: "nobody", probabilities: {} }, ["rin"])).toEqual([]);
		expect(readAddressees({ choice: "p7", probabilities: {} }, ["rin"])).toBeNull();
	});

	it("asks Jev on an OpenRouter key and names the chosen person", async () => {
		getUserOpenAIConfig.mockResolvedValue({ apiKey: "sk-or", baseUrl: "https://openrouter.ai/api/v1", model: "x" });
		const fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
			const { state, questions } = JSON.parse(init?.body as string);
			expect(state.latest_message.text).toBe("yes, the broth is amazing");
			const option = Object.entries(questions.question.criteria as Record<string, string>).find(([, text]) => text.startsWith("rin:"));
			return new Response(JSON.stringify({ answers: { question: { choice: option?.[0], probabilities: {} } } }));
		});
		expect(await inferAddressees({ userId: "u", task, learnerName: "Maple", history, fetch })).toEqual(["rin"]);
	});

	it("keeps everyone else on the heuristic without calling Jev", async () => {
		const fetch = vi.fn();
		getUserOpenAIConfig.mockResolvedValue({ apiKey: "sk", baseUrl: "https://api.deepseek.com", model: "x" });
		expect(await inferAddressees({ userId: "u", task, learnerName: "Maple", history, fetch })).toBeNull();
		getUserOpenAIConfig.mockResolvedValue(null);
		expect(await inferAddressees({ userId: "u", task, learnerName: "Maple", history, fetch })).toBeNull();
		expect(fetch).not.toHaveBeenCalled();
	});
});
