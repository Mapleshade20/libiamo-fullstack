import { dictOf } from "#lib/server/i18n.ts";

// The interface strings of one language, for a page that switches to it.
export const GET = ({ params }) => Response.json(dictOf(params.lang));
