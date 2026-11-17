import { beforeEach, expect, test, vi } from "vitest";

const send = vi.hoisted(() => vi.fn());
vi.mock("$app/env/private", () => ({ LLM_CACHE_DIR: undefined, LLM_CACHE_ONLY: false, OPENROUTER_API_KEY: undefined }));
vi.mock("#lib/server/llm/transport.ts", async (original) => ({ ...(await original<typeof import("#lib/server/llm/transport.ts")>()), send }));

import { LEARNABLE } from "#lib/constants.ts";
import { Caller } from "#lib/server/llm/caller.ts";
import { inferScene } from "#lib/server/revision/calls.ts";
import { LANG_NAMES, type Lang } from "#lib/server/revision/draft.ts";

const ai = new Caller({ route: { provider: "openrouter", model: "m", apiKey: "k" } });
const card = { site: "Reddit", community: "r/books", reader: "u/x", title: "Ask", platform: "Reddit post", audience: "fans", purpose: "ask" };

beforeEach(() => {
	send.mockReset().mockResolvedValue({ text: JSON.stringify(card), usage: {}, ms: 1, costUsd: 0 });
});

test("the scene card works in every language that can be learnt, named by the piece rather than guessed", async () => {
	for (const target of LEARNABLE) {
		const learner: Lang = target === "en" ? "zh-CN" : "en";
		const scene = await inferScene("A draft.", undefined, learner, target, "native", ai);
		expect(scene).toEqual({ ...card, target });
		const prompt = send.mock.calls.at(-1)?.[1]?.at(-1)?.content as string;
		expect(prompt).toContain(`a draft in ${LANG_NAMES[target]}, the language they are learning`);
	}
});

test("in the language being learnt, the card is written in it", async () => {
	await inferScene("Ein Entwurf.", undefined, "zh-CN", "de", "target", ai);
	const prompt = send.mock.calls.at(-1)?.[1]?.at(-1)?.content as string;
	expect(prompt).toContain("platform, audience and purpose in German");
});
