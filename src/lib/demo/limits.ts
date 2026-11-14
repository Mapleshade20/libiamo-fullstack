import { account } from "./account.svelte";
import { sandboxed } from "./app.svelte";
import { dev } from "./dev.svelte";

/*
 * What can stop a model call, as the learner meets it. Every call runs on the learner's own key (there is no trial,
 * user 2026-11-13), so: no key saved yet, the provider turning the key down (wrong, revoked, or out of credit), or the
 * call simply failing (the provider did not answer), which a retry fixes. In the demo the debug panel can make any of
 * them happen; nothing is sent when a limit stops a call. The tour runs on its tapes, so nothing stops it.
 */
export type Stop = "nokey" | "refused" | "error";
export class LimitError extends Error {
	constructor(readonly kind: Stop) {
		super(kind);
	}
}
/** Before a call, what is known without making it: whether there is a key at all. */
export const keyStop = (): "nokey" | null => (!sandboxed() && (!account.me.key || dev.limit === "nokey") ? "nokey" : null);
const failed = new Set<string>();
/** Throws as the main app's call would: no key, the provider refusing it, or (when calls fail) the first attempt of
 *  each call, so trying again goes through. `key` names the call. */
export function checkCall(key = "") {
	if (sandboxed()) return;
	const k = keyStop();
	if (k) throw new LimitError(k);
	if (dev.limit === "refused") throw new LimitError("refused");
	if (dev.limit === "fail" && !failed.has(key)) {
		failed.add(key);
		throw new LimitError("error");
	}
}
export const stopOf = (e: unknown): Stop => (e instanceof LimitError ? e.kind : "error");
