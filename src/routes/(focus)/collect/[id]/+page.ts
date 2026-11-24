import { opening } from "#lib/client/refresh.ts";
import { readingById } from "#lib/notebook/notebook.remote.ts";

// What is kept from the reading changes on this page (collecting is an endpoint): asked again before it is marked.
export const load = opening(({ params }) => [readingById(params.id)], { fresh: true });
