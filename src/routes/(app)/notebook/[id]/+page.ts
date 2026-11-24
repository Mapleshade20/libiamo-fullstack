import { opening } from "#lib/client/refresh.ts";
import { noteNow } from "#lib/notebook/notebook.svelte.ts";

export const load = opening(({ params }) => [noteNow(params.id)]);
