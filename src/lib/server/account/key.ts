import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { BETTER_AUTH_SECRET } from "$app/env/private";

/*
 * A learner's key at rest: AES-256-GCM under a key derived from BETTER_AUTH_SECRET, stored as iv:tag:ciphertext (hex).
 * scrypt is slow on purpose and blocks, so it runs once per process.
 */
let derived: Buffer | null = null;
const secret = () => (derived ??= scryptSync(BETTER_AUTH_SECRET, "libiamo-api-key-salt", 32));

export function encryptKey(plain: string): string {
	const iv = randomBytes(16);
	const cipher = createCipheriv("aes-256-gcm", secret(), iv);
	const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
	return `${iv.toString("hex")}:${cipher.getAuthTag().toString("hex")}:${data.toString("hex")}`;
}

export function decryptKey(stored: string): string {
	const [iv, tag, data] = stored.split(":");
	if (!iv || !tag || !data) throw new Error("not an encrypted key");
	const decipher = createDecipheriv("aes-256-gcm", secret(), Buffer.from(iv, "hex"));
	decipher.setAuthTag(Buffer.from(tag, "hex"));
	return Buffer.concat([decipher.update(Buffer.from(data, "hex")), decipher.final()]).toString("utf8");
}
