import { account } from "#lib/account/account.svelte.ts";
import { leaveIfSignedOut } from "#lib/client/signed-out.ts";
import { sandboxed } from "#lib/components/tour/sandbox.svelte.ts";

/*
 * What can stop a model call, as the learner meets it. Every call runs on the learner's own key, so: no key saved yet,
 * the provider turning the key down (wrong, revoked, or out of credit), or the call simply failing, which a retry
 * fixes. The server answers the first two with their code (`nokey`, `refused`); no key is also known before asking.
 * The tour runs on its tape, so nothing stops it.
 */
export type Stop = "nokey" | "refused" | "error";
export class LimitError extends Error {
	constructor(readonly kind: Stop) {
		super(kind);
	}
}
/** Before a call, what is known without making it: whether there is a key at all. */
export const keyStop = (): "nokey" | null => (!sandboxed() && !account.me.key ? "nokey" : null);
/** Throws before a call that cannot be made. */
export function needKey() {
	const k = keyStop();
	if (k) throw new LimitError(k);
}
/** The stop a server's error code names. */
export const stopFrom = (code: unknown): Stop => (code === "nokey" || code === "refused" ? code : "error");
export const stopOf = (e: unknown): Stop => (e instanceof LimitError ? e.kind : "error");
/**
 * The response's body, or the stop it names. A failed answer always carries `error`: a slow one began as a 200 before
 * it was known (server/kept-alive.ts), and one cut off on the way is not JSON.
 */
export async function answered<T>(r: Response): Promise<T> {
	leaveIfSignedOut(r);
	const v = await r.json().catch(() => null);
	if (r.ok && v && typeof v === "object" && !("error" in v)) return v as T;
	throw new LimitError(stopFrom(v?.code ?? (r.status === 402 ? "refused" : null)));
}
