import { adopt, auth } from "#lib/account/account.svelte.ts";
import { shell } from "#lib/components/shell/shell.svelte.ts";
import type { AppLang } from "#lib/constants.ts";
import { provideLang } from "#lib/i18n/index.svelte.ts";
import { keepClock } from "#lib/time/clock.svelte.ts";
import { writing } from "#lib/writing/writing.svelte.ts";

/* The server's answer poured into the state the pages read: on the server for this request, in the browser once. */
export function load({ data }) {
	for (const [l, d] of Object.entries(data.dicts)) provideLang(l as AppLang, d);
	auth.lang = data.firstLang;
	adopt(data.me);
	writing.shelves = data.shelves;
	shell.folded = data.folded;
	keepClock(data.clock);
	return { origin: data.origin, pictures: data.pictures };
}
