import { opening } from "#lib/client/refresh.ts";
import { glanceNow } from "#lib/notebook/notebook.svelte.ts";
import { historyNow } from "#lib/week/week.svelte.ts";

export const load = opening(() => [historyNow(26), glanceNow()]);
