import { opening } from "#lib/client/refresh.ts";
import { deckNow } from "#lib/notebook/notebook.svelte.ts";

export const load = opening(() => [deckNow()], { fresh: true });
