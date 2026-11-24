import { opening } from "#lib/client/refresh.ts";
import { dueNow, notebookNow } from "#lib/notebook/notebook.svelte.ts";

// The list opens unfiltered.
export const load = opening(() => [notebookNow("all"), dueNow()]);
