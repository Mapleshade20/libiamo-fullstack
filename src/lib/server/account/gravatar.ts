import { createHash } from "node:crypto";

/*
 * The account's picture is Gravatar's for its address (the only picture there is; changing it is done on Gravatar).
 * Whether one exists is asked once in a while per address, so a learner without one gets their initial and no broken
 * image; the page loads the picture itself.
 */
const KEEP_MS = 6 * 3_600_000;
const known = new Map<string, { url: string | null; at: number }>();

export async function gravatarOf(email: string): Promise<string | null> {
	const hash = createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
	const was = known.get(hash);
	if (was && Date.now() - was.at < KEEP_MS) return was.url;
	const url = `https://gravatar.com/avatar/${hash}?s=168&d=404`;
	const found = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(1500) })
		.then((r) => (r.ok ? url : null))
		// Gravatar did not answer: no picture this time, asked again next time.
		.catch(() => undefined);
	if (found !== undefined) known.set(hash, { url: found, at: Date.now() });
	return found ?? null;
}
