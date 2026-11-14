import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { RevisionSession } from "#lib/server/revision/revision.ts";
import { repoPath } from "./paths";

/* The live sessions this server holds (they live in memory, so a restart forgets them), each with the learner it
   belongs to, and each one's log under runs/live/<id>.jsonl so sessions can be read back afterwards. */
export const sessions = new Map<string, { owner: string; session: RevisionSession }>();
const dir = repoPath("runs/live");
mkdirSync(dir, { recursive: true });
export const logSession = (id: string, entry: unknown) => appendFileSync(join(dir, `${id}.jsonl`), `${JSON.stringify(entry)}\n`);
