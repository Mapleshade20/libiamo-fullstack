import { beforeEach, describe, expect, it, vi } from "vitest";

const { decide } = vi.hoisted(() => ({ decide: vi.fn() }));
vi.mock("#lib/server/llm/decide.ts", () => ({ decide }));

import { resolveScene } from "#lib/exchange/scene.ts";
import { inferAddressees, needsAddressee, readAddressees } from "#lib/server/exchange/addressee/infer.ts";
import type { TranscriptEntry } from "#lib/server/exchange/prompt-context.ts";
import { Caller } from "#lib/server/llm/caller.ts";

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
const setting = { id: "1", ui: "discord" as const, openingState };
const ai = new Caller({ route: { provider: "deepseek", model: "x", apiKey: "k" } });

describe("addressee inference", () => {
	beforeEach(() => {
		decide.mockReset();
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

	it("asks one decision on the learner's key and names the chosen person", async () => {
		decide.mockImplementation(async (_ai, state, questions: Record<string, { choices: Record<string, string> }>) => {
			expect(state.latest_message.text).toBe("yes, the broth is amazing");
			const option = Object.entries(questions.question.choices).find(([, text]) => text.startsWith("rin:"));
			return { question: { choice: option?.[0], probabilities: {} } };
		});
		expect(await inferAddressees({ ai, setting, learnerName: "Maple", history })).toEqual(["rin"]);
	});

	it("leaves the floor to the names in the text when the decision fails", async () => {
		decide.mockRejectedValue(new Error("nokey"));
		expect(await inferAddressees({ ai, setting, learnerName: "Maple", history })).toBeNull();
	});
});
