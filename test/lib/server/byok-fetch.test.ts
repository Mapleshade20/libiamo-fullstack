import { EventEmitter } from "node:events";
import type { RequestOptions } from "node:https";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requestMock } = vi.hoisted(() => ({
	requestMock: vi.fn(),
}));

vi.mock("node:https", () => ({
	request: requestMock,
}));

import { createPinnedByokFetch } from "$lib/server/byok-fetch";

function mockHttpsResponse(body: string, init: { statusCode?: number; statusMessage?: string; headers?: Record<string, string> } = {}) {
	const writes: Buffer[] = [];

	requestMock.mockImplementationOnce((_url: URL, _options: RequestOptions, callback: (response: EventEmitter) => void) => {
		const request = new EventEmitter() as EventEmitter & {
			write: ReturnType<typeof vi.fn>;
			end: ReturnType<typeof vi.fn>;
		};
		request.write = vi.fn((chunk: Buffer) => {
			writes.push(Buffer.from(chunk));
		});
		request.end = vi.fn(() => {
			const response = new EventEmitter() as EventEmitter & {
				statusCode?: number;
				statusMessage?: string;
				headers: Record<string, string>;
			};
			response.statusCode = init.statusCode ?? 200;
			response.statusMessage = init.statusMessage ?? "OK";
			response.headers = init.headers ?? { "content-type": "application/json" };

			callback(response);
			queueMicrotask(() => {
				response.emit("data", Buffer.from(body));
				response.emit("end");
			});
		});
		return request;
	});

	return { writes };
}

describe("createPinnedByokFetch", () => {
	const resolvedBaseUrl = {
		baseUrl: "https://api.example.com/v1",
		address: "93.184.216.34",
		family: 4 as const,
	};

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("sends HTTPS requests with a lookup hook pinned to the vetted address", async () => {
		const { writes } = mockHttpsResponse('{"ok":true}', {
			statusCode: 201,
			statusMessage: "Created",
			headers: { "content-type": "application/json", "x-test": "yes" },
		});
		const pinnedFetch = createPinnedByokFetch(resolvedBaseUrl);

		const response = await pinnedFetch("https://api.example.com/v1/chat/completions", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ model: "test-model" }),
		});

		expect(response.status).toBe(201);
		expect(response.statusText).toBe("Created");
		expect(response.headers.get("x-test")).toBe("yes");
		await expect(response.json()).resolves.toEqual({ ok: true });

		expect(requestMock).toHaveBeenCalledTimes(1);
		const [url, options] = requestMock.mock.calls[0] as [URL, RequestOptions];
		expect(url.toString()).toBe("https://api.example.com/v1/chat/completions");
		expect(options.method).toBe("POST");
		expect(options.headers).toEqual({ "content-type": "application/json" });
		expect(Buffer.concat(writes).toString()).toBe('{"model":"test-model"}');

		await new Promise<void>((resolve, reject) => {
			options.lookup?.("api.example.com", {}, (error, address, family) => {
				try {
					expect(error).toBeNull();
					expect(address).toBe("93.184.216.34");
					expect(family).toBe(4);
					resolve();
				} catch (assertionError) {
					reject(assertionError);
				}
			});
		});
	});

	it("rejects requests outside the validated BYOK origin", async () => {
		const pinnedFetch = createPinnedByokFetch(resolvedBaseUrl);

		await expect(pinnedFetch("https://evil.example.com/v1/chat/completions")).rejects.toThrow("validated base URL origin");
		expect(requestMock).not.toHaveBeenCalled();
	});

	it("accepts Request input with Headers and no body", async () => {
		mockHttpsResponse("ok");
		const pinnedFetch = createPinnedByokFetch(resolvedBaseUrl);
		const request = new Request("https://api.example.com/v1/models", {
			headers: new Headers({ authorization: "Bearer key" }),
		});

		const response = await pinnedFetch(request);

		await expect(response.text()).resolves.toBe("ok");
		const [_url, options] = requestMock.mock.calls[0] as [URL, RequestOptions];
		expect(options.method).toBe("GET");
		expect(options.headers).toEqual({ authorization: "Bearer key" });
	});

	it("accepts tuple header lists", async () => {
		mockHttpsResponse("ok");
		const pinnedFetch = createPinnedByokFetch(resolvedBaseUrl);

		await pinnedFetch("https://api.example.com/v1/chat/completions", {
			headers: [["x-test", "yes"]],
		});

		const [_url, options] = requestMock.mock.calls[0] as [URL, RequestOptions];
		expect(options.headers).toEqual({ "x-test": "yes" });
	});

	it.each([
		["URLSearchParams", new URLSearchParams({ a: "1" }), "a=1"],
		["ArrayBuffer", new TextEncoder().encode("buffer body").buffer, "buffer body"],
		["typed array", new TextEncoder().encode("typed body"), "typed body"],
	])("serializes %s request bodies", async (_label, body, expected) => {
		const { writes } = mockHttpsResponse("ok");
		const pinnedFetch = createPinnedByokFetch(resolvedBaseUrl);

		await pinnedFetch("https://api.example.com/v1/chat/completions", {
			method: "POST",
			body,
		});

		expect(Buffer.concat(writes).toString()).toBe(expected);
	});

	it("rejects unsupported request body types", async () => {
		const pinnedFetch = createPinnedByokFetch(resolvedBaseUrl);

		await expect(
			pinnedFetch("https://api.example.com/v1/chat/completions", {
				method: "POST",
				body: new FormData(),
			}),
		).rejects.toThrow("Unsupported BYOK request body type.");
		expect(requestMock).not.toHaveBeenCalled();
	});

	it("propagates request errors", async () => {
		requestMock.mockImplementationOnce((_url: URL, _options: RequestOptions) => {
			const request = new EventEmitter() as EventEmitter & {
				write: ReturnType<typeof vi.fn>;
				end: ReturnType<typeof vi.fn>;
			};
			request.write = vi.fn();
			request.end = vi.fn(() => {
				request.emit("error", new Error("socket failed"));
			});
			return request;
		});
		const pinnedFetch = createPinnedByokFetch(resolvedBaseUrl);

		await expect(pinnedFetch("https://api.example.com/v1/chat/completions")).rejects.toThrow("socket failed");
	});
});
