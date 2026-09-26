import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHintAssist } from "$lib/components/practice/hint/hint-assist.svelte";

const requestHint = vi.hoisted(() => vi.fn());
vi.mock("$lib/components/practice/hint/api", () => ({ requestHint }));

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

const trigger = {} as HTMLElement;

describe("createHintAssist", () => {
	beforeEach(() => requestHint.mockReset());

	it("is open for one editor at a time and sends that editor's context", async () => {
		const hint = createHintAssist(() => 7);
		hint.toggle("reply-a", trigger, () => ({ draft: "a", contextPath: [{ author: "OP", text: "Post" }] }));
		hint.toggle("reply-b", trigger, () => ({ draft: "b" }));
		requestHint.mockResolvedValue({ contentHint: "Say thanks" });

		await hint.requestContent();

		expect(hint.isOpen("reply-a")).toBe(false);
		expect(hint.isOpen("reply-b")).toBe(true);
		expect(requestHint).toHaveBeenCalledWith({ sessionId: 7, mode: "content", draft: "b", expression: undefined });
		expect(hint.contentHint).toBe("Say thanks");
		expect(hint.loading).toBe(false);
	});

	it("never shows a response that arrives after its editor closed or another editor took over", async () => {
		const hint = createHintAssist(() => 7);
		const late = deferred<{ contentHint: string }>();
		requestHint.mockReturnValue(late.promise);
		hint.toggle("top-level", trigger, () => ({ draft: "" }));
		const request = hint.requestContent();

		hint.toggle("reply-a", trigger, () => ({ draft: "" }));
		late.resolve({ contentHint: "stale" });
		await request;

		expect(hint.contentHint).toBe("");
		expect(hint.loading).toBe(false);
	});

	it("reports failures with the server message, or as a generic failure", async () => {
		const hint = createHintAssist(() => 7);
		hint.toggle("composer", trigger, () => ({ draft: "" }));

		requestHint.mockRejectedValueOnce(new Error("Trial budget exhausted."));
		await hint.requestContent();
		expect(hint.error).toBe("Trial budget exhausted.");

		requestHint.mockRejectedValueOnce(new Error(""));
		await hint.requestContent();
		expect(hint.error).toBe("");
	});

	it("asks for expression help only with a query, and not while a request is running", async () => {
		const hint = createHintAssist(() => 7);
		hint.toggle("composer", trigger, () => ({ draft: "Hola" }));
		await hint.requestExpression();
		expect(requestHint).not.toHaveBeenCalled();

		const pending = deferred<{ phrases: string[] }>();
		requestHint.mockReturnValue(pending.promise);
		hint.expressionQuery = "see you soon";
		const first = hint.requestExpression();
		await hint.requestContent();
		pending.resolve({ phrases: ["hasta pronto"] });
		await first;

		expect(requestHint).toHaveBeenCalledTimes(1);
		expect(requestHint).toHaveBeenCalledWith(expect.objectContaining({ mode: "expression", expression: "see you soon", draft: "Hola" }));
		expect(hint.phrases).toEqual(["hasta pronto"]);
	});

	it("does nothing without a session, and release only closes its own editor", async () => {
		const hint = createHintAssist(() => null);
		hint.toggle("composer", trigger, () => ({ draft: "" }));
		await hint.requestContent();
		expect(requestHint).not.toHaveBeenCalled();

		hint.release("other");
		expect(hint.isOpen("composer")).toBe(true);
		hint.release("composer");
		expect(hint.owner).toBeNull();
	});
});
