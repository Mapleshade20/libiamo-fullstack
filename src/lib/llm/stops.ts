import { account } from "#lib/account/account.svelte.ts";
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
/** Throws the response's stop when the server did not answer. */
export async function answered(r: Response): Promise<Response> {
	if (r.ok) return r;
	const v = await r
		.clone()
		.json()
		.catch(() => ({}));
	throw new LimitError(stopFrom(v?.code ?? (r.status === 402 ? "refused" : null)));
}
