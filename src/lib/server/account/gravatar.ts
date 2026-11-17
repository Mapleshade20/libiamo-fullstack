import { createHash } from "node:crypto";

/*
 * The account's picture is Gravatar's for its address (the only picture there is; changing it is done on Gravatar).
 * The server only names it: the browser loads it, and shows the learner's initial until it has (or when it does not
 * come: lib/account/picture.svelte.ts), so a slow or unreachable Gravatar never holds up a page.
 */
export function gravatarOf(email: string): string {
	const hash = createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
	// d=404: an address without a picture answers 404 rather than Gravatar's placeholder, and the initial stays.
	return `https://gravatar.com/avatar/${hash}?s=168&d=404`;
}
