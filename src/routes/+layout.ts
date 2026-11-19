import { adopt, auth } from "#lib/account/account.svelte.ts";
import { shell } from "#lib/components/shell/shell.svelte.ts";
import { loadLang } from "#lib/i18n/index.svelte.ts";
import { keepClock } from "#lib/time/clock.svelte.ts";
import { writing } from "#lib/writing/writing.svelte.ts";

/* The server's answer poured into the state the pages read: on the server for this request, in the browser once. The
   strings of the page's languages are loaded before it renders (in the browser, from files it keeps). */
export async function load({ data }) {
	await Promise.all(data.langs.map(loadLang));
	auth.lang = data.firstLang;
	adopt(data.me);
	writing.shelves = data.shelves;
	shell.folded = data.folded;
	keepClock(data.clock);
	return { origin: data.origin, pictures: data.pictures };
}
