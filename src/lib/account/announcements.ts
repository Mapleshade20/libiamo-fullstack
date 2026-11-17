import { app } from "#lib/account/app.svelte.ts";
import { dateAt } from "#lib/time/clock.svelte.ts";

/* How an announcement reads on the page: in the interface language, else the learner's own, else English. */
export const local = (o: Record<string, string>) => o[app.lang] ?? o[app.prefs.native] ?? o.en ?? Object.values(o)[0] ?? "";
export const dateOf = (iso: string) => dateAt(iso, { month: "short", day: "numeric" });
