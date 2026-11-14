import { join } from "node:path";

/** Files the dev server reads and writes beside the app (session logs, the name tables). */
export const repoPath = (...p: string[]) => join(process.cwd(), ...p);
