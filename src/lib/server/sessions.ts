import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { LiveSession } from "#model/session/live.ts";
import { inSession } from "#model/trace.ts";
import { repoPath } from "./paths";

/* The live sessions this server holds (they live in memory, so a restart forgets them), and each one's log under
   runs/live/<id>.jsonl so sessions can be read back afterwards. */
export const sessions = new Map<string, LiveSession>();
const dir = repoPath("runs/live");
mkdirSync(dir, { recursive: true });
export const logSession = (id: string, entry: unknown) => appendFileSync(join(dir, `${id}.jsonl`), `${JSON.stringify(entry)}\n`);

/** A page that is not a session traces its calls under its own id (sent as `x-trace`), for its debug bubbles. */
export function traced<T>(request: Request, purpose: string, fn: () => Promise<T>): Promise<T> {
	const id = (request.headers.get("x-trace") ?? "").replace(/[^\w-]/g, "").slice(0, 60) || "untraced";
	return inSession(id, purpose, fn);
}
