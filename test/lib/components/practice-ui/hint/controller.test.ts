import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestHint } from "$lib/components/practice-ui/hint/api";
import { createHintController } from "$lib/components/practice-ui/hint/controller.svelte";
import { getHintLabels } from "$lib/components/practice-ui/hint/i18n";
import { createHintOwnership } from "$lib/components/practice-ui/hint/ownership";

vi.mock("$lib/components/practice-ui/hint/api", () => ({ requestHint: vi.fn() }));
const context = { sessionId: 1, language: "fr", draft: "My draft" };
function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason: unknown) => void;
	const promise = new Promise<T>((yes, no) => {
		resolve = yes;
		reject = no;
	});
	return { promise, resolve, reject };
}
const origin = { isConnected: true, focus: vi.fn() } as unknown as HTMLElement;
beforeEach(() => vi.resetAllMocks());

describe("hint controller", () => {
	it("aborts a replaced request and rejects its late result", async () => {
		const first = deferred<{ contentHint: string }>();
		const second = deferred<{ phrases: string[] }>();
		vi.mocked(requestHint).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
		const hints = createHintController({ getContext: () => context });
		hints.open(origin);
		const content = hints.requestContent();
		const oldSignal = vi.mocked(requestHint).mock.calls[0][0].signal;
		hints.expressionQuery = "  Say hello  ";
		const expression = hints.requestExpression();
		expect(oldSignal?.aborted).toBe(true);
		expect(hints.state).toBe("loading");
		expect(hints.submittedQuery).toBe("Say hello");
		second.resolve({ phrases: ["Bonjour"] });
		await expression;
		first.resolve({ contentHint: "stale" });
		await content;
		expect(hints.phrases).toEqual(["Bonjour"]);
		expect(hints.contentHint).toBe("");
		expect(hints.state).toBe("success");
	});

	it.each(["dismiss", "reset", "destroy"] as const)("%s aborts pending work and prevents late output", async (operation) => {
		const pending = deferred<{ contentHint: string }>();
		vi.mocked(requestHint).mockReturnValue(pending.promise);
		const hints = createHintController({ getContext: () => context });
		hints.open(origin);
		const request = hints.requestContent();
		const signal = vi.mocked(requestHint).mock.calls[0][0].signal;
		hints[operation]();
		expect(signal?.aborted).toBe(true);
		pending.resolve({ contentHint: "late" });
		await request;
		expect(hints.contentHint).toBe("");
		expect(hints.state).toBe("idle");
		if (operation !== "reset") expect(hints.isOpen).toBe(false);
	});

	it("transfers ownership between editors without letting an old owner release the new one", async () => {
		const ownership = createHintOwnership();
		const pending = deferred<{ contentHint: string }>();
		vi.mocked(requestHint).mockReturnValue(pending.promise);
		const first = createHintController({ getContext: () => context, ownership });
		const second = createHintController({ getContext: () => context, ownership });
		first.open(origin);
		const request = first.requestContent();
		const signal = vi.mocked(requestHint).mock.calls[0][0].signal;
		second.open(origin);
		first.destroy();
		expect(signal?.aborted).toBe(true);
		expect(first.isOpen).toBe(false);
		expect(second.isOpen).toBe(true);
		pending.resolve({ contentHint: "late" });
		await request;
		expect(second.contentHint).toBe("");
	});

	it("shows localized failures and allows retry without modifying the draft", async () => {
		vi.mocked(requestHint).mockRejectedValueOnce(new Error("network details")).mockResolvedValueOnce({ contentHint: "Try a greeting" });
		const hints = createHintController({ getContext: () => context });
		hints.open(origin);
		await hints.requestContent();
		expect(hints.error).toBe(getHintLabels("fr").failure);
		expect(hints.state).toBe("failure");
		await hints.requestContent();
		expect(hints.state).toBe("success");
		expect(hints.error).toBeNull();
		expect(context.draft).toBe("My draft");
	});

	it("ignores results belonging to a replaced session", async () => {
		let sessionId = 1;
		const pending = deferred<{ contentHint: string }>();
		vi.mocked(requestHint).mockReturnValue(pending.promise);
		const hints = createHintController({ getContext: () => ({ ...context, sessionId }) });
		hints.open(origin);
		const request = hints.requestContent();
		sessionId = 2;
		pending.resolve({ contentHint: "old session" });
		await request;
		expect(hints.contentHint).toBe("");
		expect(hints.state).toBe("idle");
	});
});
