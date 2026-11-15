import { expect, it, vi } from "vitest";
import { Caller } from "#lib/server/llm/caller.ts";
import { RevisionSession } from "#lib/server/revision/revision.ts";

const calls = vi.hoisted(() => ({ detect: vi.fn(), readBack: vi.fn() }));
vi.mock("#lib/server/revision/pipeline/detect.ts", () => ({ detectSplit: calls.detect }));
vi.mock("#lib/server/revision/pass2/analyze.ts", async (original) => ({
	...(await original<typeof import("#lib/server/revision/pass2/analyze.ts")>()),
	readBack: calls.readBack,
}));
vi.mock("#lib/server/revision/pass2/map.ts", () => ({ outline: async () => ({ value: {} }) }));

function revision() {
	const ai = new Caller({ route: null });
	const initial = new RevisionSession({ text: "I like it.", learner: "en", feedback: "native" }, ai);
	const state = initial.snapshot();
	state.d = {
		id: "test",
		text: "I like it.",
		target: "en",
		learner: "en",
		level: "B2",
		scene: { platform: "post", audience: "friends", purpose: "share" },
	};
	return RevisionSession.restore(state, ai);
}

it("starts detection again after a transient failure, rather than reawaiting a rejected promise", async () => {
	calls.detect
		.mockReset()
		.mockImplementationOnce(() => {
			const failed = Promise.reject(new Error("temporary provider failure"));
			return { pass1: failed, pass2: failed, rewrite: failed, base: failed };
		})
		.mockImplementation(() => ({
			pass1: Promise.resolve({ findings: [] }),
			pass2: Promise.resolve({ analysis: { gist: "", map: [], spots: [] }, base: { text: "I like it.", left: [] } }),
			rewrite: Promise.resolve({ pass1: "I like it." }),
			base: Promise.resolve({ text: "I like it.", left: [] }),
		}));
	const s = revision();
	await expect(s.pass1()).rejects.toThrow("temporary provider failure");
	await expect(s.pass1()).resolves.toMatchObject({ stops: [] });
	expect(calls.detect).toHaveBeenCalledTimes(2);
});

it("reissues a failed read-back for unchanged pass-1 answers", async () => {
	calls.readBack.mockReset().mockRejectedValueOnce(new Error("temporary read-back failure")).mockResolvedValue({ text: "A reader's reply" });
	const s = revision();
	s.pass1Done({});
	await expect(s.overview()).rejects.toThrow("temporary read-back failure");
	s.pass1Done({});
	await vi.waitFor(() => expect(calls.readBack).toHaveBeenCalledTimes(2));
	await vi.waitFor(() => expect(s.snapshot().found.readBack?.text).toBe("A reader's reply"));
});

it("observes the new pass-1 promise even when a previously settled result is reused", async () => {
	calls.detect.mockReset().mockImplementation(() => ({
		pass1: Promise.reject(new Error("retry annotation failed")),
		pass2: Promise.resolve({ analysis: { gist: "", map: [], spots: [] }, base: { text: "I like it.", left: [] } }),
		rewrite: Promise.resolve({ pass1: "I like it." }),
		base: Promise.resolve({ text: "I like it.", left: [] }),
	}));
	const ai = new Caller({ route: null });
	const state = new RevisionSession({ text: "I like it.", learner: "en", feedback: "native" }, ai).snapshot();
	state.d = {
		id: "test",
		text: "I like it.",
		target: "en",
		learner: "en",
		level: "B2",
		scene: { platform: "post", audience: "friends", purpose: "share" },
	};
	state.found.pass1 = [];
	const s = RevisionSession.restore(state, ai);
	await expect(s.pass1()).resolves.toMatchObject({ stops: [] });
	await new Promise((resolve) => setTimeout(resolve, 0));
});
