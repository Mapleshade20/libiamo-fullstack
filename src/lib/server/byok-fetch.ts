import { request } from "node:https";
import type { LookupFunction } from "node:net";
import type { ResolvedByokBaseUrl } from "./byok-url";

function headersToRecord(headers: HeadersInit | undefined): Record<string, string> {
	if (!headers) return {};
	if (headers instanceof Headers) return Object.fromEntries(headers.entries());
	if (Array.isArray(headers)) return Object.fromEntries(headers);
	return headers;
}

async function bodyToBuffer(body: BodyInit | null | undefined): Promise<Buffer | undefined> {
	if (!body) return undefined;
	if (typeof body === "string") return Buffer.from(body);
	if (body instanceof URLSearchParams) return Buffer.from(body.toString());
	if (body instanceof ArrayBuffer) return Buffer.from(body);
	if (ArrayBuffer.isView(body)) return Buffer.from(body.buffer, body.byteOffset, body.byteLength);

	throw new TypeError("Unsupported BYOK request body type.");
}

export function createPinnedByokFetch(resolved: ResolvedByokBaseUrl): typeof fetch {
	const baseUrl = new URL(resolved.baseUrl);
	const lookup: LookupFunction = (_hostname, _options, callback) => {
		callback(null, resolved.address, resolved.family);
	};

	return async (input, init = {}) => {
		const url = new URL(input instanceof Request ? input.url : input);
		if (url.protocol !== "https:" || url.origin !== baseUrl.origin) {
			throw new TypeError("BYOK requests must stay on the validated base URL origin.");
		}

		const body = await bodyToBuffer(init.body ?? (input instanceof Request ? input.body : null));
		const headers = headersToRecord(init.headers ?? (input instanceof Request ? input.headers : undefined));
		const method = init.method ?? (input instanceof Request ? input.method : "GET");

		return new Promise<Response>((resolve, reject) => {
			const req = request(
				url,
				{
					method,
					headers,
					lookup,
					signal: init.signal ?? (input instanceof Request ? input.signal : undefined),
				},
				(res) => {
					const chunks: Buffer[] = [];
					res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
					res.on("end", () => {
						resolve(
							new Response(Buffer.concat(chunks), {
								status: res.statusCode ?? 0,
								statusText: res.statusMessage,
								headers: res.headers as HeadersInit,
							}),
						);
					});
				},
			);

			req.on("error", reject);
			if (body) req.write(body);
			req.end();
		});
	};
}
