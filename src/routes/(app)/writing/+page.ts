import { opening } from "#lib/client/refresh.ts";
import { piecesPageNow } from "#lib/writing/writing.svelte.ts";

export const load = opening(() => [piecesPageNow()]);
