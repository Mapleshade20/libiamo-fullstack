import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { postPageAction, sendMessage } from "$lib/components/practice/session/actions";

vi.mock("$app/forms", () => ({ deserialize: (text: string) => JSON.parse(text) }));

const fetchMock = vi.fn();

function respond(result: unknown) {
	fetchMock.mockResolvedValue({ text: () => Promise.resolve(JSON.stringify(result)) });
}

function lastRequest() {
	const [url, init] = fetchMock.mock.calls.at(-1) as [URL, RequestInit];
	return { url, body: init.body as FormData };
}

beforeEach(() => {
	vi.stubGlobal("fetch", fetchMock);
	vi.stubGlobal("window", { location: { href: "http://localhost/libiamo/task/5/session?lineup=12" } });
	vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	fetchMock.mockReset();
});

describe("postPageAction", () => {
	it("posts to the current page, keeping its query, and omits empty fields", async () => {
		respond({ type: "success", data: { sessionId: 3 } });

		await postPageAction("start", { sessionId: null, note: "", mode: "content" });

		const { url, body } = lastRequest();
		expect(url.pathname).toBe("/libiamo/task/5/session");
		expect(url.searchParams.get("lineup")).toBe("12");
		expect(url.searchParams.has("/start")).toBe(true);
		expect([...body.keys()]).toEqual(["mode"]);
	});
});

describe("sendMessage", () => {
	it("sends the message, its client id and extra fields", async () => {
		respond({ type: "success", data: { pending: true } });

		expect(await sendMessage(42, "Hello", "m1", { threadTargetCommentId: "c1" })).toEqual({ status: "pending" });
		const { url, body } = lastRequest();
		expect(url.searchParams.has("/send")).toBe(true);
		expect(Object.fromEntries(body)).toEqual({ threadTargetCommentId: "c1", sessionId: "42", message: "Hello", clientMessageId: "m1" });
	});

	it("reports a send that completed the session", async () => {
		respond({ type: "success", data: { sessionCompleted: true, pending: false } });

		expect(await sendMessage(1, "Last", "m2")).toEqual({ status: "session_completed" });
	});

	it("reports server errors with their message, and bare client errors as rejected", async () => {
		respond({ type: "failure", status: 402, data: { error: "Trial budget exhausted." } });
		expect(await sendMessage(1, "Hi", "m3")).toEqual({ status: "failed", error: "Trial budget exhausted." });

		respond({ type: "failure", status: 403, data: {} });
		expect(await sendMessage(1, "Hi", "m3")).toEqual({ status: "rejected" });

		respond({ type: "failure", status: 503, data: {} });
		expect(await sendMessage(1, "Hi", "m3")).toEqual({ status: "failed" });
	});

	it("treats network errors and unexpected payloads as failed", async () => {
		fetchMock.mockRejectedValue(new Error("offline"));
		expect(await sendMessage(1, "Hi", "m4")).toEqual({ status: "failed" });

		respond({ type: "success", data: { reply: "legacy synchronous reply" } });
		expect(await sendMessage(1, "Hi", "m4")).toEqual({ status: "failed" });
	});
});
