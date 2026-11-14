import { redirect } from "@sveltejs/kit";
import type { Resumed } from "#lib/session/session.svelte.ts";
import { takeHanded } from "#lib/session/start.ts";
import type { Setup } from "#lib/session/types.ts";

/*
 * A piece's revision: opened with what the page that created it handed over, or (a reload, a restart, another device)
 * from where the revision was. A finished piece opens on its own page; one that is not the learner's, or has no
 * revision left, back home.
 */
export async function load({ params, fetch }) {
	const handed = takeHanded(params.id);
	if (handed) return { id: params.id, setup: handed, resumed: null };
	const r = await fetch(`/api/s/${params.id}/resume`, { method: "POST" });
	const v = await r.json().catch(() => null);
	if (v?.finished) redirect(307, `/w/${params.id}`);
	if (!r.ok || !v?.setup) redirect(307, "/");
	const { setup, ...resumed } = v as Resumed & { setup: Setup };
	return { id: params.id, setup, resumed: resumed as Resumed };
}
