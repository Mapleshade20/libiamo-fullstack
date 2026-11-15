import { app } from "#lib/account/app.svelte.ts";
import { endonym, langName } from "#lib/constants.ts";
import { t } from "./index.svelte.ts";

/** The interface's string for a key, in the language being worked in. */
export const tx = (key: string, vars?: Record<string, string | number>) => t(app.lang, key, vars);
/** A language's name in the interface language. */
export const nameOf = (code: string) => langName(code, app.lang);
export { endonym };
