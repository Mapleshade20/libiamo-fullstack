import crypto from "node:crypto";
import { env } from "$env/dynamic/private";
import { ByokBaseUrlError, normalizeByokBaseUrl } from "$lib/server/byok-url";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;

function deriveKey(): Buffer {
	const secret = env.BETTER_AUTH_SECRET;
	if (!secret) throw new Error("BETTER_AUTH_SECRET is not set");
	return crypto.scryptSync(secret, "libiamo-api-key-salt", 32);
}

export function encryptApiKey(plaintext: string): string {
	const key = deriveKey();
	const iv = crypto.randomBytes(IV_LENGTH);
	const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

	let encrypted = cipher.update(plaintext, "utf8", "hex");
	encrypted += cipher.final("hex");
	const authTag = cipher.getAuthTag();

	// Format: iv:authTag:ciphertext (all hex)
	return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

export function decryptApiKey(ciphertext: string): string {
	const key = deriveKey();
	const parts = ciphertext.split(":");

	if (parts.length !== 3) {
		throw new Error("Invalid encrypted API key format");
	}

	const iv = Buffer.from(parts[0], "hex");
	const authTag = Buffer.from(parts[1], "hex");
	const encrypted = parts[2];

	const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
	decipher.setAuthTag(authTag);

	let decrypted = decipher.update(encrypted, "hex", "utf8");
	decrypted += decipher.final("utf8");

	return decrypted;
}

// ── Verification ────────────────────────────────────────────────────

const VERIFY_TIMEOUT_MS = 8000;

export async function verifyApiKey(baseUrl: string, apiKey: string, model: string): Promise<{ ok: true } | { ok: false; error: string }> {
	let normalizedBase: string;
	try {
		normalizedBase = await normalizeByokBaseUrl(baseUrl);
	} catch (error) {
		if (error instanceof ByokBaseUrlError) return { ok: false, error: error.message };
		throw error;
	}

	const endpoint = `${normalizedBase}/chat/completions`;

	let response: Response;
	try {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);

		response = await fetch(endpoint, {
			method: "POST",
			redirect: "manual",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${apiKey}`,
			},
			body: JSON.stringify({
				model,
				messages: [{ role: "user", content: "Hi" }],
				max_tokens: 1,
			}),
			signal: controller.signal,
		});
		clearTimeout(timeout);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (message.includes("abort") || message.includes("AbortError") || message.includes("timeout")) {
			return { ok: false, error: "Request timed out. Check the Base URL." };
		}
		return { ok: false, error: `Network error: ${message}` };
	}

	if (response.ok) {
		return { ok: true };
	}

	let detail = `HTTP ${response.status}`;
	try {
		const body = await response.text();
		const parsed = JSON.parse(body);
		const errorVal = (parsed as Record<string, unknown>).error;
		const msg =
			errorVal && typeof errorVal === "object" && errorVal !== null
				? (errorVal as Record<string, unknown>).message || JSON.stringify(errorVal)
				: body.slice(0, 200);
		detail = `HTTP ${response.status}: ${msg}`;
	} catch {
		// Use default detail
	}

	return { ok: false, error: detail };
}
